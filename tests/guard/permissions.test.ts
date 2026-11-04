// 守りのテスト：権限（役割ごとに見える範囲・書ける範囲が設計どおりか）
// 担当：Claude Code。Antigravity はこのファイルを変更・削除・スキップしない（CLAUDE.md・計画ファイル 7章）。
// 根拠：docs/tasks/plan_foundation_v1.md の 4章（表と権限）、NOTES.md「まとまり2：権限」。
//
// 動かし方：.env に SUPABASE_URL・SUPABASE_ANON_KEY・SUPABASE_SERVICE_ROLE_KEY を入れ、`npm test`。
// 開発用の Supabase プロジェクトに、架空の人（@example.test）を作って確かめ、最後に消す。本物のデータは使わない。
// 日付は、時差で結果が変わらないよう、今日から離れた日（2025-04-01 開始、2026-03-31 終了など）だけを使う。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const URL = process.env.SUPABASE_URL ?? '';
const ANON = process.env.SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const RUN = `guard${Date.now().toString(36)}`;

type Person = {
  key: string;
  name: string;
  role: 'member' | 'leader' | 'mgr' | 'ceo';
  email: string;
  password: string;
  authId?: string;
  memberId?: string;
  client?: SupabaseClient;
};

const PEOPLE: Person[] = [
  ['leaderA', 'leader'],
  ['memberA1', 'member'],
  ['memberA2', 'member'],
  ['mover', 'member'], // チームB → チームA に異動した人
  ['leaderB', 'leader'], // 管理者の権限を持つ
  ['memberB1', 'member'],
  ['mgr1', 'mgr'], // チームAを担当中。チームBの担当は終了済み
  ['ceo', 'ceo'],
].map(([key, role]) => ({
  key,
  name: `${RUN}-${key}`,
  role: role as Person['role'],
  email: `${RUN}-${key.toLowerCase()}@example.test`,
  password: `${randomUUID()}Aa1!`,
}));

const P = (key: string) => {
  const p = PEOPLE.find((x) => x.key === key);
  if (!p) throw new Error(`no person ${key}`);
  return p;
};

let admin: SupabaseClient;
let teamA = '';
let teamB = '';
let adminPermissionId = '';
const createdPermissionIds: string[] = [];

// 名簿にない人（ログインはできるが members に行がない）。登録を許しているので、ここが安全の中心になる
const outsider = {
  email: `${RUN}-outsider@example.test`,
  password: `${randomUUID()}Aa1!`,
  authId: '',
  client: undefined as SupabaseClient | undefined,
};

const ALL = PEOPLE.map((p) => p.key);
const TEAM_A_NOW = ['leaderA', 'memberA1', 'memberA2', 'mover'];
const TEAM_B_NOW = ['leaderB', 'memberB1'];

async function visibleKeys(client: SupabaseClient): Promise<string[]> {
  const ids = PEOPLE.map((p) => p.memberId!);
  const { data, error } = await client.from('members').select('id').in('id', ids);
  if (error) return [];
  const seen = new Set((data ?? []).map((r: { id: string }) => r.id));
  return PEOPLE.filter((p) => seen.has(p.memberId!)).map((p) => p.key).sort();
}

const sorted = (xs: string[]) => [...xs].sort();

// 指定した列の値が ids のどれかに当たる行を読む。読めないとき（許可がない・エラー）は空とみなす
async function rowsOf(
  client: SupabaseClient,
  table: string,
  column: string,
  ids: string[],
): Promise<Record<string, unknown>[]> {
  const { data, error } = await client.from(table).select('*').in(column, ids);
  if (error) return [];
  return (data ?? []) as Record<string, unknown>[];
}

const memberIds = () => PEOPLE.map((p) => p.memberId!);
const teamIds = () => [teamA, teamB];

async function nameOf(memberId: string): Promise<string> {
  const { data, error } = await admin.from('members').select('name').eq('id', memberId).single();
  if (error) throw error;
  return (data as { name: string }).name;
}

beforeAll(async () => {
  if (!URL || !ANON || !SERVICE) {
    throw new Error('.env に SUPABASE_URL・SUPABASE_ANON_KEY・SUPABASE_SERVICE_ROLE_KEY がありません');
  }
  admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: teams, error: teamErr } = await admin
    .from('teams')
    .insert([{ name: `${RUN}-A` }, { name: `${RUN}-B` }])
    .select('id, name');
  if (teamErr) throw teamErr;
  teamA = teams!.find((t: { name: string }) => t.name.endsWith('-A'))!.id;
  teamB = teams!.find((t: { name: string }) => t.name.endsWith('-B'))!.id;

  for (const p of PEOPLE) {
    const { data, error } = await admin.auth.admin.createUser({
      email: p.email,
      password: p.password,
      email_confirm: true,
    });
    if (error) throw error;
    p.authId = data.user!.id;
    const { data: m, error: mErr } = await admin
      .from('members')
      .insert({
        auth_user_id: p.authId,
        email: p.email,
        name: p.name,
        role: p.role,
        goes_to_sales: false,
        hired_on: '2025-04-01',
      })
      .select('id')
      .single();
    if (mErr) throw mErr;
    p.memberId = (m as { id: string }).id;
  }

  const aff = (key: string, team: string, start: string, end: string | null) => ({
    member_id: P(key).memberId,
    team_id: team,
    base: '架空の拠点',
    start_date: start,
    end_date: end,
  });
  const { error: affErr } = await admin.from('member_affiliations').insert([
    aff('leaderA', teamA, '2025-04-01', null),
    aff('memberA1', teamA, '2025-04-01', null),
    aff('memberA2', teamA, '2025-04-01', null),
    aff('mover', teamB, '2025-04-01', '2026-03-31'),
    aff('mover', teamA, '2026-04-01', null),
    aff('leaderB', teamB, '2025-04-01', null),
    aff('memberB1', teamB, '2025-04-01', null),
  ]);
  if (affErr) throw affErr;

  const { error: asgErr } = await admin.from('mgr_assignments').insert([
    { mgr_member_id: P('mgr1').memberId, team_id: teamA, start_date: '2025-04-01', end_date: null, assigned_by: P('ceo').memberId },
    { mgr_member_id: P('mgr1').memberId, team_id: teamB, start_date: '2025-04-01', end_date: '2026-03-31', assigned_by: P('ceo').memberId },
  ]);
  if (asgErr) throw asgErr;

  const { data: perm, error: permErr } = await admin
    .from('permissions')
    .insert({ member_id: P('leaderB').memberId, kind: 'admin', granted_by: P('ceo').memberId, granted_at: new Date().toISOString() })
    .select('id')
    .single();
  if (permErr) throw permErr;
  adminPermissionId = (perm as { id: string }).id;
  createdPermissionIds.push(adminPermissionId);

  for (const p of PEOPLE) {
    const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await c.auth.signInWithPassword({ email: p.email, password: p.password });
    if (error) throw error;
    p.client = c;
  }

  const { data: od, error: oErr } = await admin.auth.admin.createUser({
    email: outsider.email,
    password: outsider.password,
    email_confirm: true,
  });
  if (oErr) throw oErr;
  outsider.authId = od.user!.id;
  const oc = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: osErr } = await oc.auth.signInWithPassword({ email: outsider.email, password: outsider.password });
  if (osErr) throw osErr;
  outsider.client = oc;
}, 120_000);

// 「権限の表を読める範囲」のテストで、memberA2 に足す talk_owner の行。あとのテスト（自分で取り消せない）でも使う
let extraPermissionId = '';

// 後片づけで消せなかったときは、黙らずに知らせる（架空の行や利用者が残らないように）
function warnIf(label: string, error: { message: string } | null) {
  if (error) console.warn(`後片づけで消せなかった：${label}：${error.message}`);
}

afterAll(async () => {
  if (!admin) return;
  if (outsider.authId) warnIf('名簿にない人', (await admin.auth.admin.deleteUser(outsider.authId)).error);
  const ids = PEOPLE.map((p) => p.memberId).filter(Boolean) as string[];
  if (ids.length) {
    warnIf('permissions', (await admin.from('permissions').delete().in('member_id', ids)).error);
    warnIf('mgr_assignments', (await admin.from('mgr_assignments').delete().in('mgr_member_id', ids)).error);
    warnIf('member_affiliations', (await admin.from('member_affiliations').delete().in('member_id', ids)).error);
    warnIf('members', (await admin.from('members').delete().in('id', ids)).error);
  }
  if (teamA || teamB) warnIf('teams', (await admin.from('teams').delete().in('id', [teamA, teamB].filter(Boolean))).error);
  for (const p of PEOPLE) {
    if (p.authId) warnIf(`利用者 ${p.key}`, (await admin.auth.admin.deleteUser(p.authId)).error);
  }
}, 120_000);

// 管理用の鍵で読み直す。読み直しがエラーなら、その場で失敗にする（エラーを「0件」と取り違えないため）
async function adminRows(
  table: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 絞り込みの書き方は表ごとに違うので、ここでは型を問わない
  build: (q: any) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await build(admin.from(table).select('*'));
  expect(error).toBeNull();
  return (data ?? []) as Record<string, unknown>[];
}

describe('名簿を読める範囲（members）', () => {
  it('ログインしていない人は、だれも読めない', async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    expect(await visibleKeys(anon)).toEqual([]);
  });

  it('ログインしていない人は、チーム・所属・担当・権限も読めない', async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    expect(await rowsOf(anon, 'teams', 'id', teamIds())).toHaveLength(0);
    expect(await rowsOf(anon, 'member_affiliations', 'member_id', memberIds())).toHaveLength(0);
    expect(await rowsOf(anon, 'mgr_assignments', 'mgr_member_id', memberIds())).toHaveLength(0);
    expect(await rowsOf(anon, 'permissions', 'member_id', memberIds())).toHaveLength(0);
  });

  it('ログインしていても名簿にない人は、何も読めない', async () => {
    const c = outsider.client!;
    expect(await visibleKeys(c)).toEqual([]);
    expect(await rowsOf(c, 'teams', 'id', teamIds())).toHaveLength(0);
    expect(await rowsOf(c, 'member_affiliations', 'member_id', memberIds())).toHaveLength(0);
    expect(await rowsOf(c, 'mgr_assignments', 'mgr_member_id', memberIds())).toHaveLength(0);
    expect(await rowsOf(c, 'permissions', 'member_id', memberIds())).toHaveLength(0);
  });

  it('権限の表は、代表と管理者は全員分、ほかの人は自分の行だけ読める', async () => {
    // ほかの人（memberA2）の権限の行を1つ用意する。管理者（leaderB）が、自分以外の行も読めるかを確かめるため
    const { data: extra, error: exErr } = await admin
      .from('permissions')
      .insert({ member_id: P('memberA2').memberId, kind: 'talk_owner', granted_by: P('ceo').memberId, granted_at: new Date().toISOString() })
      .select('id')
      .single();
    if (exErr) throw exErr;
    extraPermissionId = (extra as { id: string }).id;
    createdPermissionIds.push(extraPermissionId);

    const ceoRows = await rowsOf(P('ceo').client!, 'permissions', 'member_id', memberIds());
    expect(ceoRows.map((r) => r.id)).toEqual(expect.arrayContaining([adminPermissionId, extraPermissionId]));
    const adminRowsSeen = await rowsOf(P('leaderB').client!, 'permissions', 'member_id', memberIds());
    expect(adminRowsSeen.map((r) => r.id)).toEqual(expect.arrayContaining([adminPermissionId, extraPermissionId]));
    const ownRows = await rowsOf(P('memberA2').client!, 'permissions', 'member_id', memberIds());
    expect(ownRows.map((r) => r.id)).toContain(extraPermissionId);
    for (const key of ['memberA1', 'memberA2', 'leaderA', 'mgr1']) {
      const rows = await rowsOf(P(key).client!, 'permissions', 'member_id', memberIds());
      expect(rows.every((r) => r.member_id === P(key).memberId)).toBe(true);
    }
  });

  it('メンバーは、自分と今の所属が同じチームの人だけ読める', async () => {
    expect(await visibleKeys(P('memberA1').client!)).toEqual(sorted(TEAM_A_NOW));
  });

  it('異動した人は、前のチームのメンバーからは見えず、今のチームのメンバーから見える', async () => {
    expect(await visibleKeys(P('memberB1').client!)).toEqual(sorted(TEAM_B_NOW));
    expect(await visibleKeys(P('memberA2').client!)).toContain('mover');
  });

  it('リーダーは、今の所属が同じチームの人だけ読める', async () => {
    expect(await visibleKeys(P('leaderA').client!)).toEqual(sorted(TEAM_A_NOW));
  });

  it('MGRは、自分と今担当しているチームの人だけ読める（担当が終わったチームは読めない）', async () => {
    expect(await visibleKeys(P('mgr1').client!)).toEqual(sorted(['mgr1', ...TEAM_A_NOW]));
  });

  it('代表は、全員を読める', async () => {
    expect(await visibleKeys(P('ceo').client!)).toEqual(sorted(ALL));
  });

  it('管理者の権限がある人は、全員を読める', async () => {
    expect(await visibleKeys(P('leaderB').client!)).toEqual(sorted(ALL));
  });

  it('所属・担当・チームも、名簿と同じ範囲で読める（読めるべき人は読め、ほかのチームの人の分は読めない）', async () => {
    const ownerKeys = (rows: Record<string, unknown>[], col: string) =>
      PEOPLE.filter((p) => rows.some((r) => r[col] === p.memberId)).map((p) => p.key);

    const a1Aff = await rowsOf(P('memberA1').client!, 'member_affiliations', 'member_id', memberIds());
    expect(ownerKeys(a1Aff, 'member_id')).toEqual(expect.arrayContaining(['memberA1', 'memberA2']));
    expect(ownerKeys(a1Aff, 'member_id')).not.toContain('memberB1');
    expect(ownerKeys(a1Aff, 'member_id')).not.toContain('leaderB');

    const a1Teams = await rowsOf(P('memberA1').client!, 'teams', 'id', teamIds());
    expect(a1Teams.map((r) => r.id)).toContain(teamA);

    const mgrAssign = await rowsOf(P('mgr1').client!, 'mgr_assignments', 'mgr_member_id', memberIds());
    expect(mgrAssign.some((r) => r.mgr_member_id === P('mgr1').memberId && r.team_id === teamA)).toBe(true);
    const mgrAff = await rowsOf(P('mgr1').client!, 'member_affiliations', 'member_id', memberIds());
    expect(ownerKeys(mgrAff, 'member_id')).toContain('memberA1');
    expect(ownerKeys(mgrAff, 'member_id')).not.toContain('memberB1');

    const ceoAff = await rowsOf(P('ceo').client!, 'member_affiliations', 'member_id', memberIds());
    expect(ownerKeys(ceoAff, 'member_id')).toEqual(expect.arrayContaining(['memberA1', 'memberB1']));
  });
});

describe('名簿と権限を書ける範囲', () => {
  it('メンバーは、自分の行でも名前も役割も書きかえられない（1つずつ試す）', async () => {
    const before = await nameOf(P('memberA1').memberId!);
    await P('memberA1').client!.from('members').update({ name: `${RUN}-changed` }).eq('id', P('memberA1').memberId!);
    expect(await nameOf(P('memberA1').memberId!)).toBe(before);

    await P('memberA1').client!.from('members').update({ role: 'ceo' }).eq('id', P('memberA1').memberId!);
    const rows = await adminRows('members', (q) => q.eq('id', P('memberA1').memberId!));
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('member');
  });

  it('リーダー（管理者の権限なし）は、自分のチームの人でも名簿を書きかえられない', async () => {
    const before = await nameOf(P('memberA2').memberId!);
    await P('leaderA').client!.from('members').update({ name: `${RUN}-changed` }).eq('id', P('memberA2').memberId!);
    expect(await nameOf(P('memberA2').memberId!)).toBe(before);
  });

  it('代表（今回は書く権限なし）とMGRも、名簿を書きかえられない', async () => {
    const before = await nameOf(P('memberB1').memberId!);
    await P('ceo').client!.from('members').update({ name: `${RUN}-by-ceo` }).eq('id', P('memberB1').memberId!);
    expect(await nameOf(P('memberB1').memberId!)).toBe(before);
    const beforeA1 = await nameOf(P('memberA1').memberId!);
    await P('mgr1').client!.from('members').update({ name: `${RUN}-by-mgr` }).eq('id', P('memberA1').memberId!);
    expect(await nameOf(P('memberA1').memberId!)).toBe(beforeA1);
  });

  it('メンバーは、権限を自分に与えられない', async () => {
    await P('memberA1').client!.from('permissions').insert({
      member_id: P('memberA1').memberId,
      kind: 'admin',
      granted_by: P('memberA1').memberId,
      granted_at: new Date().toISOString(),
    });
    const rows = await adminRows('permissions', (q) =>
      q.eq('member_id', P('memberA1').memberId!).eq('kind', 'admin').is('revoked_at', null),
    );
    expect(rows).toHaveLength(0);
  });

  it('メンバーは、自分を別のチームの所属に足せず、自分の所属も書きかえられない', async () => {
    await P('memberA1').client!.from('member_affiliations').insert({
      member_id: P('memberA1').memberId,
      team_id: teamB,
      base: '架空の拠点',
      start_date: '2025-04-01',
      end_date: null,
    });
    const added = await adminRows('member_affiliations', (q) => q.eq('member_id', P('memberA1').memberId!).eq('team_id', teamB));
    expect(added).toHaveLength(0);

    await P('memberA1').client!
      .from('member_affiliations')
      .update({ end_date: '2025-12-31' })
      .eq('member_id', P('memberA1').memberId!);
    const own = await adminRows('member_affiliations', (q) => q.eq('member_id', P('memberA1').memberId!).eq('team_id', teamA));
    expect(own).toHaveLength(1);
    expect(own[0].end_date).toBeNull();
  });

  it('リーダー（管理者の権限なし）は、MGRの担当を足せない', async () => {
    await P('leaderA').client!.from('mgr_assignments').insert({
      mgr_member_id: P('mgr1').memberId,
      team_id: teamB,
      start_date: '2025-04-01',
      end_date: null,
      assigned_by: P('leaderA').memberId,
    });
    const rows = await adminRows('mgr_assignments', (q) =>
      q.eq('mgr_member_id', P('mgr1').memberId!).eq('team_id', teamB).is('end_date', null),
    );
    expect(rows).toHaveLength(0);
  });

  it('だれも行を削除できない（管理者の権限がある人も。削除はのちに論理削除で入れる）', async () => {
    await P('memberA1').client!.from('members').delete().eq('id', P('memberA1').memberId!);
    await P('leaderB').client!.from('members').delete().eq('id', P('memberB1').memberId!);
    await P('leaderB').client!.from('member_affiliations').delete().eq('member_id', P('memberB1').memberId!);
    await P('ceo').client!.from('permissions').delete().eq('id', extraPermissionId);
    expect(await adminRows('members', (q) => q.in('id', [P('memberA1').memberId!, P('memberB1').memberId!]))).toHaveLength(2);
    expect(await adminRows('member_affiliations', (q) => q.eq('member_id', P('memberB1').memberId!))).toHaveLength(1);
    expect(await adminRows('permissions', (q) => q.eq('id', extraPermissionId))).toHaveLength(1);
  });

  it('代表は、権限を与えられる', async () => {
    const { data, error } = await P('ceo').client!
      .from('permissions')
      .insert({
        member_id: P('memberA1').memberId,
        kind: 'talk_owner',
        granted_by: P('ceo').memberId,
        granted_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    createdPermissionIds.push((data as { id: string }).id);
  });

  it('権限を持つ本人は、自分の権限を取り消せない（取り消しは代表と管理者だけ）', async () => {
    await P('memberA2').client!
      .from('permissions')
      .update({ revoked_at: new Date().toISOString(), revoked_by: P('memberA2').memberId })
      .eq('id', extraPermissionId);
    const rows = await adminRows('permissions', (q) => q.eq('id', extraPermissionId));
    expect(rows).toHaveLength(1);
    expect(rows[0].revoked_at).toBeNull();
  });

  it('管理者の権限がある人は、名簿を書きかえられる', async () => {
    const newName = `${RUN}-memberA2-renamed`;
    await P('leaderB').client!.from('members').update({ name: newName }).eq('id', P('memberA2').memberId!);
    expect(await nameOf(P('memberA2').memberId!)).toBe(newName);
  });

  it('管理者の権限を取り消すと、全員は読めず、名簿も書きかえられず、自分で元にも戻せない', async () => {
    const { error } = await admin
      .from('permissions')
      .update({ revoked_at: new Date().toISOString(), revoked_by: P('ceo').memberId })
      .eq('id', adminPermissionId);
    expect(error).toBeNull();

    expect(await visibleKeys(P('leaderB').client!)).toEqual(sorted(TEAM_B_NOW));

    const before = await nameOf(P('memberB1').memberId!);
    await P('leaderB').client!.from('members').update({ name: `${RUN}-changed-again` }).eq('id', P('memberB1').memberId!);
    expect(await nameOf(P('memberB1').memberId!)).toBe(before);

    await P('leaderB').client!.from('permissions').update({ revoked_at: null, revoked_by: null }).eq('id', adminPermissionId);
    const rows = await adminRows('permissions', (q) => q.eq('id', adminPermissionId));
    expect(rows).toHaveLength(1);
    expect(rows[0].revoked_at).not.toBeNull();
  });
});
