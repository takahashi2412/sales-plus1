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
}, 120_000);

afterAll(async () => {
  if (!admin) return;
  const ids = PEOPLE.map((p) => p.memberId).filter(Boolean) as string[];
  if (ids.length) {
    await admin.from('permissions').delete().in('member_id', ids);
    await admin.from('mgr_assignments').delete().in('mgr_member_id', ids);
    await admin.from('member_affiliations').delete().in('member_id', ids);
    await admin.from('members').delete().in('id', ids);
  }
  if (teamA || teamB) await admin.from('teams').delete().in('id', [teamA, teamB].filter(Boolean));
  for (const p of PEOPLE) {
    if (p.authId) await admin.auth.admin.deleteUser(p.authId);
  }
}, 120_000);

describe('名簿を読める範囲（members）', () => {
  it('ログインしていない人は、だれも読めない', async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    expect(await visibleKeys(anon)).toEqual([]);
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
});

describe('名簿と権限を書ける範囲', () => {
  it('メンバーは、自分の行でも名簿を書きかえられない', async () => {
    const before = await nameOf(P('memberA1').memberId!);
    await P('memberA1').client!.from('members').update({ name: `${RUN}-changed`, role: 'ceo' }).eq('id', P('memberA1').memberId!);
    expect(await nameOf(P('memberA1').memberId!)).toBe(before);
    const { data } = await admin.from('members').select('role').eq('id', P('memberA1').memberId!).single();
    expect((data as { role: string }).role).toBe('member');
  });

  it('リーダー（管理者の権限なし）は、自分のチームの人でも名簿を書きかえられない', async () => {
    const before = await nameOf(P('memberA2').memberId!);
    await P('leaderA').client!.from('members').update({ name: `${RUN}-changed` }).eq('id', P('memberA2').memberId!);
    expect(await nameOf(P('memberA2').memberId!)).toBe(before);
  });

  it('メンバーは、権限を自分に与えられない', async () => {
    await P('memberA1').client!.from('permissions').insert({
      member_id: P('memberA1').memberId,
      kind: 'admin',
      granted_by: P('memberA1').memberId,
      granted_at: new Date().toISOString(),
    });
    const { data } = await admin
      .from('permissions')
      .select('id')
      .eq('member_id', P('memberA1').memberId!)
      .eq('kind', 'admin')
      .is('revoked_at', null);
    expect(data ?? []).toHaveLength(0);
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

  it('管理者の権限がある人は、名簿を書きかえられる', async () => {
    const newName = `${RUN}-memberA2-renamed`;
    await P('leaderB').client!.from('members').update({ name: newName }).eq('id', P('memberA2').memberId!);
    expect(await nameOf(P('memberA2').memberId!)).toBe(newName);
  });

  it('管理者の権限を取り消すと、全員は読めず、名簿も書きかえられなくなる', async () => {
    const { error } = await admin
      .from('permissions')
      .update({ revoked_at: new Date().toISOString(), revoked_by: P('ceo').memberId })
      .eq('id', adminPermissionId);
    expect(error).toBeNull();

    expect(await visibleKeys(P('leaderB').client!)).toEqual(sorted(TEAM_B_NOW));

    const before = await nameOf(P('memberB1').memberId!);
    await P('leaderB').client!.from('members').update({ name: `${RUN}-changed-again` }).eq('id', P('memberB1').memberId!);
    expect(await nameOf(P('memberB1').memberId!)).toBe(before);
  });
});
