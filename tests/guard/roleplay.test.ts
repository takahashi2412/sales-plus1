// 守りのテスト：ロープレの区切り（指導の記録・トーク一覧・研修・一覧と設定値・監査ログ・退職した人）
// 担当：Claude Code。Antigravity はこのファイルを変更・削除・スキップしない（計画ファイル 7章）。
// 根拠：docs/tasks/plan_roleplay-common_v1.md の 4章（表と権限）。NOTES.md の決めたことの表（2026-11-04：指導の記録は役割どおり、退職日の判定）。
//
// 動かし方：.env に SUPABASE_URL・SUPABASE_ANON_KEY・SUPABASE_SERVICE_ROLE_KEY を入れ、`npm test`。
// 開発用の Supabase プロジェクトに、架空の人（@example.test）と架空の記録を作って確かめ、最後に消す。本物のデータは使わない。
// 日付は、時差で結果が変わらないよう、今日から離れた日（2025-04-01 開始、2025-12-31 退職など）だけを使う。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const URL = process.env.SUPABASE_URL ?? '';
const ANON = process.env.SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const RUN = `guardrp${Date.now().toString(36)}`;

type Person = {
  key: string;
  role: 'member' | 'leader' | 'mgr' | 'ceo';
  team: 'A' | 'B' | null;
  retiredOn?: string;
  email: string;
  password: string;
  authId?: string;
  memberId?: string;
  client?: SupabaseClient;
};

const PEOPLE: Person[] = (
  [
    ['leaderA', 'leader', 'A'],
    ['memberA1', 'member', 'A'],
    ['memberA2', 'member', 'A'],
    ['leaderB', 'leader', 'B'], // 管理者の権限を持つ（指導の記録は広がらないことを確かめる）
    ['memberB1', 'member', 'B'],
    ['talkOwner', 'member', 'B'], // トーク責任者の権限を持つ
    ['mgr1', 'mgr', null], // チームAを担当中
    ['ceo', 'ceo', null],
    ['retired', 'leader', 'A', '2025-12-31'], // 退職したリーダー（役割が残っていても、何も読めない・書けない）
    ['retiredCeo', 'ceo', null, '2025-12-31'], // 退職した代表（代表の判定も退職で外れる）
  ] as const
).map(([key, role, team, retiredOn]) => ({
  key,
  role,
  team,
  retiredOn,
  email: `${RUN}-${key.toLowerCase()}@example.test`,
  password: `${randomUUID()}Aa1!`,
}));

const P = (key: string) => {
  const p = PEOPLE.find((x) => x.key === key);
  if (!p) throw new Error(`no person ${key}`);
  return p;
};

let admin: SupabaseClient;
const ids = {
  teamA: '',
  teamB: '',
  theme: '',
  master: '',
  rpA1: '', // memberA1 のロープレ（送った記録。実行者 leaderA）
  rpA1Draft: '', // memberA1 のロープレ（書きかけ。実行者 leaderA）
  rpB1: '', // memberB1 のロープレ（送った記録。実行者 leaderB）
  mtA1: '', // memberA1 のテーマ表
  talkPendA: '', // チームAの確認待ち（作った人 memberA1）
  talkTrialA: '', // チームAの試行中（作った人 leaderA）
  talkPendB: '', // チームBの確認待ち（作った人 memberB1）
  seminar: '', // 研修（参加者 memberA1。作った人 leaderA）
};
const permissionIds: string[] = []; // 監査ログの片づけに使う
const settingKey = `${RUN}_setting`;
// テーマ番号は一意にしない決まりだが、途中で落ちた回の残りとぶつからないよう回ごとに変える
const themeNo = 900000 + Math.floor(Math.random() * 90000);

const anonClient = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

// 読めないとき（許可がない・エラー）は空とみなす。ログインした人の側の読み取りに使う
async function rowsOf(client: SupabaseClient, table: string, column: string, values: string[]): Promise<Record<string, unknown>[]> {
  const { data, error } = await client.from(table).select('*').in(column, values);
  if (error) return [];
  return (data ?? []) as Record<string, unknown>[];
}

const idsOf = (rows: Record<string, unknown>[]) => rows.map((r) => r.id);

// 管理用の鍵で読み直す。エラーならその場で失敗にする（エラーを「0件」と取り違えないため）
async function adminRows(
  table: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 絞り込みの書き方は表ごとに違うので、ここでは型を問わない
  build: (q: any) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await build(admin.from(table).select('*'));
  expect(error).toBeNull();
  return (data ?? []) as Record<string, unknown>[];
}

async function insertOne(table: string, row: Record<string, unknown>, idColumn = 'id'): Promise<string> {
  const { data, error } = await admin.from(table).insert(row).select(idColumn).single();
  if (error) throw error;
  return (data as Record<string, string>)[idColumn];
}

beforeAll(async () => {
  if (!URL || !ANON || !SERVICE) {
    throw new Error('.env に SUPABASE_URL・SUPABASE_ANON_KEY・SUPABASE_SERVICE_ROLE_KEY がありません');
  }
  admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  ids.teamA = await insertOne('teams', { name: `${RUN}-A` });
  ids.teamB = await insertOne('teams', { name: `${RUN}-B` });

  for (const p of PEOPLE) {
    const { data, error } = await admin.auth.admin.createUser({ email: p.email, password: p.password, email_confirm: true });
    if (error) throw error;
    p.authId = data.user!.id;
    p.memberId = await insertOne('members', {
      auth_user_id: p.authId,
      email: p.email,
      name: `${RUN}-${p.key}`,
      role: p.role,
      goes_to_sales: false,
      hired_on: '2025-04-01',
      retired_on: p.retiredOn ?? null,
    });
    if (p.team) {
      await insertOne('member_affiliations', {
        member_id: p.memberId,
        team_id: p.team === 'A' ? ids.teamA : ids.teamB,
        base: '架空の拠点',
        start_date: '2025-04-01',
        end_date: p.retiredOn ?? null,
      });
    }
  }
  await insertOne('mgr_assignments', {
    mgr_member_id: P('mgr1').memberId,
    team_id: ids.teamA,
    start_date: '2025-04-01',
    end_date: null,
    assigned_by: P('ceo').memberId,
  });
  permissionIds.push(await insertOne('permissions', { member_id: P('leaderB').memberId, kind: 'admin', granted_by: P('ceo').memberId, granted_at: new Date().toISOString() }));
  permissionIds.push(await insertOne('permissions', { member_id: P('talkOwner').memberId, kind: 'talk_owner', granted_by: P('ceo').memberId, granted_at: new Date().toISOString() }));

  ids.master = await insertOne('masters', { kind: 'scene', name: `${RUN}-scene`, sort_order: 1, is_active: true });
  const { error: setErr } = await admin.from('settings').insert({ key: settingKey, value: 30, reason: '守りのテストの準備', updated_by: null, updated_at: new Date().toISOString() });
  if (setErr) throw setErr;
  ids.theme = await insertOne('roleplay_themes', { no: themeNo, stage: 1, name: `${RUN}-theme`, kind: 'apo', pass_example: '架空の例', is_active: true });

  const rp = (runner: string, member: string, submitted: boolean) => ({
    date: '2025-05-01',
    runner_member_id: P(runner).memberId,
    member_id: P(member).memberId,
    time_slot: '10',
    kind: 'apo',
    theme_id: ids.theme,
    minutes: 10,
    repeat_count: 1,
    pass_result: 'o',
    fixed_point: '架空の直した点',
    submitted_at: submitted ? new Date().toISOString() : null,
  });
  ids.rpA1 = await insertOne('roleplays', rp('leaderA', 'memberA1', true));
  ids.rpA1Draft = await insertOne('roleplays', rp('leaderA', 'memberA1', false));
  ids.rpB1 = await insertOne('roleplays', rp('leaderB', 'memberB1', true));

  ids.mtA1 = await insertOne('member_themes', {
    member_id: P('memberA1').memberId,
    theme_id: ids.theme,
    kind: 'apo',
    started_on: '2025-05-01',
    pass_line: '架空の合格ライン',
    status: 'practicing',
    created_by: P('leaderA').memberId,
  });

  const talk = (code: string, team: string, creator: string, status: string) => ({
    code,
    their_words: '架空の相手の言葉',
    wording: '架空の言い方',
    aim: '架空のねらい',
    team_id: team,
    created_by: P(creator).memberId,
    status,
  });
  ids.talkPendA = await insertOne('talks', talk(`OUT-${RUN}-1`, ids.teamA, 'memberA1', 'pending'));
  ids.talkTrialA = await insertOne('talks', talk(`OUT-${RUN}-2`, ids.teamA, 'leaderA', 'trial'));
  ids.talkPendB = await insertOne('talks', talk(`OUT-${RUN}-3`, ids.teamB, 'memberB1', 'pending'));

  ids.seminar = await insertOne('seminars', { date: '2025-05-02', theme: `${RUN}-seminar`, lecturer: '架空の講師', minutes: 60, content: '架空の内容', created_by: P('leaderA').memberId });
  const { error: smErr } = await admin.from('seminar_members').insert({ seminar_id: ids.seminar, member_id: P('memberA1').memberId });
  if (smErr) throw smErr;

  for (const p of PEOPLE) {
    const c = anonClient();
    const { error } = await c.auth.signInWithPassword({ email: p.email, password: p.password });
    if (error) throw error;
    p.client = c;
  }
}, 180_000);

function warnIf(label: string, error: { message: string } | null) {
  if (error) console.warn(`後片づけで消せなかった：${label}：${error.message}`);
}

afterAll(async () => {
  if (!admin) return;
  const memberIds = PEOPLE.map((p) => p.memberId).filter(Boolean) as string[];
  const teams = [ids.teamA, ids.teamB].filter(Boolean);
  if (ids.seminar) warnIf('seminar_members', (await admin.from('seminar_members').delete().eq('seminar_id', ids.seminar)).error);
  if (memberIds.length) {
    warnIf('seminar_members（テストで足した分）', (await admin.from('seminar_members').delete().in('member_id', memberIds)).error);
    warnIf('seminars', (await admin.from('seminars').delete().in('created_by', memberIds)).error);
    warnIf('roleplays', (await admin.from('roleplays').delete().in('member_id', memberIds)).error);
    warnIf('member_themes', (await admin.from('member_themes').delete().in('member_id', memberIds)).error);
    warnIf('talks', (await admin.from('talks').delete().in('created_by', memberIds)).error);
  }
  warnIf('roleplay_themes', (await admin.from('roleplay_themes').delete().like('name', `${RUN}%`)).error);
  // 監査ログの片づけ用に、この回で入れた一覧と権限の id を控える
  const auditRowIds: string[] = [settingKey, ...permissionIds];
  const { data: runMasters } = await admin.from('masters').select('id').like('name', `${RUN}%`);
  for (const m of runMasters ?? []) auditRowIds.push(String(m.id));
  if (memberIds.length) {
    const { data: runPerms } = await admin.from('permissions').select('id').in('member_id', memberIds);
    for (const p of runPerms ?? []) auditRowIds.push(String(p.id));
  }
  warnIf('masters', (await admin.from('masters').delete().like('name', `${RUN}%`)).error);
  warnIf('settings', (await admin.from('settings').delete().like('key', `${RUN}%`)).error);
  if (memberIds.length) {
    warnIf('permissions', (await admin.from('permissions').delete().in('member_id', memberIds)).error);
    warnIf('mgr_assignments', (await admin.from('mgr_assignments').delete().in('mgr_member_id', memberIds)).error);
    warnIf('member_affiliations', (await admin.from('member_affiliations').delete().in('member_id', memberIds)).error);
    warnIf('members', (await admin.from('members').delete().in('id', memberIds)).error);
  }
  if (teams.length) warnIf('teams', (await admin.from('teams').delete().in('id', teams)).error);
  // 片づけの削除で増えた分も含めて、この回の監査ログを消す（管理用の鍵だけが消せる）
  warnIf('audit_logs', (await admin.from('audit_logs').delete().in('row_id', [...new Set(auditRowIds)])).error);
  for (const p of PEOPLE) {
    if (p.authId) warnIf(`利用者 ${p.key}`, (await admin.auth.admin.deleteUser(p.authId)).error);
  }
}, 180_000);

describe('読める範囲', () => {
  it('ログインしていない人は、ロープレの区切りの表をどれも読めない', async () => {
    const c = anonClient();
    expect(await rowsOf(c, 'masters', 'id', [ids.master])).toHaveLength(0);
    expect(await rowsOf(c, 'settings', 'key', [settingKey])).toHaveLength(0);
    expect(await rowsOf(c, 'roleplay_themes', 'id', [ids.theme])).toHaveLength(0);
    expect(await rowsOf(c, 'roleplays', 'id', [ids.rpA1, ids.rpB1])).toHaveLength(0);
    expect(await rowsOf(c, 'member_themes', 'id', [ids.mtA1])).toHaveLength(0);
    expect(await rowsOf(c, 'talks', 'id', [ids.talkPendA, ids.talkTrialA])).toHaveLength(0);
    expect(await rowsOf(c, 'seminars', 'id', [ids.seminar])).toHaveLength(0);
    expect(await rowsOf(c, 'seminar_members', 'seminar_id', [ids.seminar])).toHaveLength(0);
    expect(await rowsOf(c, 'audit_logs', 'row_id', [ids.master])).toHaveLength(0);
  });

  it('退職日を過ぎた人は、リーダーや代表の役割が残っていても、名簿も記録も権限も読めない', async () => {
    for (const key of ['retired', 'retiredCeo']) {
      const c = P(key).client!;
      expect(await rowsOf(c, 'members', 'id', PEOPLE.map((p) => p.memberId!))).toHaveLength(0);
      expect(await rowsOf(c, 'permissions', 'member_id', PEOPLE.map((p) => p.memberId!))).toHaveLength(0);
      expect(await rowsOf(c, 'masters', 'id', [ids.master])).toHaveLength(0);
      expect(await rowsOf(c, 'talks', 'id', [ids.talkPendA, ids.talkTrialA, ids.talkPendB])).toHaveLength(0);
      expect(await rowsOf(c, 'roleplays', 'id', [ids.rpA1, ids.rpB1])).toHaveLength(0);
      expect(await rowsOf(c, 'member_themes', 'id', [ids.mtA1])).toHaveLength(0);
      expect(await rowsOf(c, 'seminars', 'id', [ids.seminar])).toHaveLength(0);
      expect(await rowsOf(c, 'audit_logs', 'row_id', [ids.master])).toHaveLength(0);
    }
  });

  it('退職した人の名簿の行は消えず、代表は読める（リーダーからは、所属が閉じたので見えない）', async () => {
    expect(await rowsOf(P('ceo').client!, 'members', 'id', [P('retired').memberId!])).toHaveLength(1);
    expect(await rowsOf(P('leaderA').client!, 'members', 'id', [P('retired').memberId!])).toHaveLength(0);
  });

  it('名簿にいる人は、一覧・テーマ一覧を読める（設定値も）', async () => {
    const c = P('memberA1').client!;
    expect(idsOf(await rowsOf(c, 'masters', 'id', [ids.master]))).toContain(ids.master);
    expect(idsOf(await rowsOf(c, 'roleplay_themes', 'id', [ids.theme]))).toContain(ids.theme);
    expect(await rowsOf(c, 'settings', 'key', [settingKey])).toHaveLength(1);
  });

  it('ロープレの記録：課員本人は送った自分の記録だけ。同じチームのほかのメンバーは読めない', async () => {
    const own = idsOf(await rowsOf(P('memberA1').client!, 'roleplays', 'id', [ids.rpA1, ids.rpA1Draft, ids.rpB1]));
    expect(own).toContain(ids.rpA1);
    expect(own).not.toContain(ids.rpA1Draft);
    expect(own).not.toContain(ids.rpB1);
    expect(await rowsOf(P('memberA2').client!, 'roleplays', 'id', [ids.rpA1])).toHaveLength(0);
    expect(await rowsOf(P('memberB1').client!, 'roleplays', 'id', [ids.rpA1])).toHaveLength(0);
  });

  it('ロープレの記録：書いた人は書きかけも読める。担当のMGRと代表は送った記録だけ', async () => {
    const runner = idsOf(await rowsOf(P('leaderA').client!, 'roleplays', 'id', [ids.rpA1, ids.rpA1Draft]));
    expect(runner).toEqual(expect.arrayContaining([ids.rpA1, ids.rpA1Draft]));
    const mgr = idsOf(await rowsOf(P('mgr1').client!, 'roleplays', 'id', [ids.rpA1, ids.rpA1Draft, ids.rpB1]));
    expect(mgr).toContain(ids.rpA1);
    expect(mgr).not.toContain(ids.rpA1Draft);
    expect(mgr).not.toContain(ids.rpB1);
    const ceo = idsOf(await rowsOf(P('ceo').client!, 'roleplays', 'id', [ids.rpA1, ids.rpA1Draft, ids.rpB1]));
    expect(ceo).toEqual(expect.arrayContaining([ids.rpA1, ids.rpB1]));
    expect(ceo).not.toContain(ids.rpA1Draft);
  });

  it('ロープレの記録とテーマ表：管理者の権限があっても、ほかのチームの分は読めない（役割どおり）', async () => {
    const c = P('leaderB').client!;
    expect(idsOf(await rowsOf(c, 'roleplays', 'id', [ids.rpA1, ids.rpB1]))).toEqual([ids.rpB1]);
    expect(await rowsOf(c, 'member_themes', 'id', [ids.mtA1])).toHaveLength(0);
  });

  it('テーマ表：課員本人と上席は読め、同じチームのほかのメンバーは読めない', async () => {
    expect(idsOf(await rowsOf(P('memberA1').client!, 'member_themes', 'id', [ids.mtA1]))).toContain(ids.mtA1);
    expect(idsOf(await rowsOf(P('leaderA').client!, 'member_themes', 'id', [ids.mtA1]))).toContain(ids.mtA1);
    expect(idsOf(await rowsOf(P('ceo').client!, 'member_themes', 'id', [ids.mtA1]))).toContain(ids.mtA1);
    expect(await rowsOf(P('memberA2').client!, 'member_themes', 'id', [ids.mtA1])).toHaveLength(0);
  });

  it('トーク一覧：確認待ちは、作った人・そのチームの上席・トーク責任者・代表だけが読める', async () => {
    const all = [ids.talkPendA, ids.talkTrialA, ids.talkPendB];
    const seen = async (key: string) => idsOf(await rowsOf(P(key).client!, 'talks', 'id', all));
    expect(await seen('memberA2')).toEqual([ids.talkTrialA]);
    expect(await seen('memberB1')).toEqual(expect.arrayContaining([ids.talkTrialA, ids.talkPendB]));
    expect(await seen('memberB1')).not.toContain(ids.talkPendA);
    expect(await seen('memberA1')).toEqual(expect.arrayContaining([ids.talkPendA, ids.talkTrialA]));
    expect(await seen('leaderA')).toEqual(expect.arrayContaining([ids.talkPendA, ids.talkTrialA]));
    expect(await seen('leaderA')).not.toContain(ids.talkPendB);
    expect(await seen('mgr1')).toContain(ids.talkPendA);
    expect(await seen('leaderB')).not.toContain(ids.talkPendA);
    expect(await seen('talkOwner')).toEqual(expect.arrayContaining(all));
    expect(await seen('ceo')).toEqual(expect.arrayContaining(all));
  });

  it('研修の記録：参加した本人と、リーダー・MGR・代表は読め、参加していないメンバーは読めない', async () => {
    expect(idsOf(await rowsOf(P('memberA1').client!, 'seminars', 'id', [ids.seminar]))).toContain(ids.seminar);
    expect(await rowsOf(P('memberA2').client!, 'seminars', 'id', [ids.seminar])).toHaveLength(0);
    for (const key of ['leaderA', 'leaderB', 'mgr1', 'ceo']) {
      expect(idsOf(await rowsOf(P(key).client!, 'seminars', 'id', [ids.seminar]))).toContain(ids.seminar);
    }
  });

  it('監査ログ：代表と管理者は読め、メンバー・リーダーは読めない', async () => {
    // 管理用の鍵で入れた行は、変えた人が空になる
    const byService = await adminRows('audit_logs', (q) => q.eq('table_name', 'masters').eq('row_id', ids.master));
    expect(byService.some((l) => l.action === 'insert' && l.actor_member_id === null)).toBe(true);
    expect((await rowsOf(P('ceo').client!, 'audit_logs', 'row_id', [ids.master])).length).toBeGreaterThan(0);
    expect((await rowsOf(P('leaderB').client!, 'audit_logs', 'row_id', [ids.master])).length).toBeGreaterThan(0);
    expect(await rowsOf(P('memberA1').client!, 'audit_logs', 'row_id', [ids.master])).toHaveLength(0);
    expect(await rowsOf(P('leaderA').client!, 'audit_logs', 'row_id', [ids.master])).toHaveLength(0);
  });
});

describe('書ける範囲', () => {
  const newRp = (runner: string, member: string, fixed: string) => ({
    date: '2025-05-03',
    runner_member_id: P(runner).memberId,
    member_id: P(member).memberId,
    time_slot: '11',
    kind: 'apo',
    theme_id: ids.theme,
    minutes: 5,
    repeat_count: 1,
    pass_result: 'd',
    fixed_point: fixed,
    submitted_at: new Date().toISOString(),
  });
  const rpByFixed = (fixed: string) => adminRows('roleplays', (q) => q.eq('fixed_point', fixed));

  it('ロープレの記録：自分を実行者にして、読める課員の分だけ足せる', async () => {
    const ok = `${RUN}-ok`;
    await P('leaderA').client!.from('roleplays').insert(newRp('leaderA', 'memberA1', ok));
    expect(await rpByFixed(ok)).toHaveLength(1);

    const peer = `${RUN}-peer`;
    await P('memberA2').client!.from('roleplays').insert(newRp('memberA2', 'memberA1', peer));
    expect(await rpByFixed(peer)).toHaveLength(1);

    const other = `${RUN}-other-runner`;
    await P('leaderA').client!.from('roleplays').insert(newRp('mgr1', 'memberA1', other));
    expect(await rpByFixed(other)).toHaveLength(0);

    const outside = `${RUN}-outside`;
    await P('memberB1').client!.from('roleplays').insert(newRp('memberB1', 'memberA1', outside));
    expect(await rpByFixed(outside)).toHaveLength(0);

    // 管理者の権限では、書ける範囲も広がらない（役割どおり）
    const byAdmin = `${RUN}-by-admin-leader`;
    await P('leaderB').client!.from('roleplays').insert(newRp('leaderB', 'memberA1', byAdmin));
    expect(await rpByFixed(byAdmin)).toHaveLength(0);

    const mgr = `${RUN}-by-mgr`;
    await P('mgr1').client!.from('roleplays').insert(newRp('mgr1', 'memberA1', mgr));
    expect(await rpByFixed(mgr)).toHaveLength(1);
  });

  it('ロープレの記録：直せるのは書いた人だけ。実行者や課員を、ほかの人や読めない人に付けかえられない', async () => {
    await P('mgr1').client!.from('roleplays').update({ note: `${RUN}-by-mgr` }).eq('id', ids.rpA1);
    expect((await adminRows('roleplays', (q) => q.eq('id', ids.rpA1)))[0].note).not.toBe(`${RUN}-by-mgr`);
    await P('leaderA').client!.from('roleplays').update({ note: `${RUN}-by-runner` }).eq('id', ids.rpA1);
    expect((await adminRows('roleplays', (q) => q.eq('id', ids.rpA1)))[0].note).toBe(`${RUN}-by-runner`);

    await P('leaderA').client!.from('roleplays').update({ runner_member_id: P('mgr1').memberId }).eq('id', ids.rpA1);
    expect((await adminRows('roleplays', (q) => q.eq('id', ids.rpA1)))[0].runner_member_id).toBe(P('leaderA').memberId);
    await P('leaderA').client!.from('roleplays').update({ member_id: P('memberB1').memberId }).eq('id', ids.rpA1);
    expect((await adminRows('roleplays', (q) => q.eq('id', ids.rpA1)))[0].member_id).toBe(P('memberA1').memberId);
  });

  it('テーマ表：卒業にできるのは上席だけ（課員本人はできない）', async () => {
    const statusOf = async () => (await adminRows('member_themes', (q) => q.eq('id', ids.mtA1)))[0].status;
    await P('memberA1').client!.from('member_themes').update({ status: 'graduated', graduated_on: '2025-05-10' }).eq('id', ids.mtA1);
    expect(await statusOf()).toBe('practicing');
    await P('memberA2').client!.from('member_themes').update({ status: 'graduated', graduated_on: '2025-05-10' }).eq('id', ids.mtA1);
    expect(await statusOf()).toBe('practicing');
    await P('leaderA').client!.from('member_themes').update({ status: 'graduated', graduated_on: '2025-05-10' }).eq('id', ids.mtA1);
    expect(await statusOf()).toBe('graduated');
  });

  it('テーマ表：課員本人は足せず、上席は足せる', async () => {
    const theme2 = await insertOne('roleplay_themes', { no: themeNo + 1, stage: 2, name: `${RUN}-theme2`, kind: 'sales', pass_example: '架空の例', is_active: true });
    const row = (member: string, by: string) => ({
      member_id: P(member).memberId,
      theme_id: theme2,
      kind: 'sales',
      started_on: '2025-05-03',
      pass_line: '架空',
      status: 'practicing',
      created_by: P(by).memberId,
    });
    await P('memberA2').client!.from('member_themes').insert(row('memberA2', 'memberA2'));
    expect(await adminRows('member_themes', (q) => q.eq('member_id', P('memberA2').memberId!).eq('theme_id', theme2))).toHaveLength(0);
    await P('leaderA').client!.from('member_themes').insert(row('memberA2', 'leaderA'));
    expect(await adminRows('member_themes', (q) => q.eq('member_id', P('memberA2').memberId!).eq('theme_id', theme2))).toHaveLength(1);
  });

  it('トーク一覧：名簿にいる人は確認待ちだけを足せ、試行中としては足せない', async () => {
    const base = { their_words: '架空', wording: '架空', aim: '架空', team_id: ids.teamA, created_by: P('memberA2').memberId };
    await P('memberA2').client!.from('talks').insert({ ...base, code: `OUT-${RUN}-new`, status: 'pending' });
    expect(await adminRows('talks', (q) => q.eq('code', `OUT-${RUN}-new`))).toHaveLength(1);
    await P('memberA2').client!.from('talks').insert({ ...base, code: `OUT-${RUN}-skip`, status: 'trial' });
    expect(await adminRows('talks', (q) => q.eq('code', `OUT-${RUN}-skip`))).toHaveLength(0);
  });

  it('トーク一覧：チームは、メンバーは今の所属、MGRは担当のチームだけ。代表はチームなしでよい', async () => {
    const add = (key: string, code: string, team: string | null) =>
      P(key).client!.from('talks').insert({ their_words: '架空', wording: '架空', aim: '架空', team_id: team, created_by: P(key).memberId, code, status: 'pending' });
    const count = async (code: string) => (await adminRows('talks', (q) => q.eq('code', code))).length;

    await add('memberA2', `OUT-${RUN}-wrongteam`, ids.teamB);
    expect(await count(`OUT-${RUN}-wrongteam`)).toBe(0);
    await add('mgr1', `OUT-${RUN}-mgr-a`, ids.teamA);
    expect(await count(`OUT-${RUN}-mgr-a`)).toBe(1);
    await add('mgr1', `OUT-${RUN}-mgr-b`, ids.teamB);
    expect(await count(`OUT-${RUN}-mgr-b`)).toBe(0);
    await add('ceo', `OUT-${RUN}-ceo`, null);
    expect(await count(`OUT-${RUN}-ceo`)).toBe(1);

    // チームなしの確認待ちは、試行中にできるのは代表だけ。メンバー・ほかのチームのリーダーには見えない
    const ceoTalk = (await adminRows('talks', (q) => q.eq('code', `OUT-${RUN}-ceo`)))[0];
    expect(await rowsOf(P('memberA1').client!, 'talks', 'id', [String(ceoTalk.id)])).toHaveLength(0);
    await P('leaderA').client!.from('talks').update({ status: 'trial' }).eq('id', String(ceoTalk.id));
    expect((await adminRows('talks', (q) => q.eq('id', String(ceoTalk.id))))[0].status).toBe('pending');
    await P('ceo').client!.from('talks').update({ status: 'trial' }).eq('id', String(ceoTalk.id));
    expect((await adminRows('talks', (q) => q.eq('id', String(ceoTalk.id))))[0].status).toBe('trial');
  });

  it('トーク一覧の2段階：確認待ち→試行中はそのチームの上席だけ、試行中→標準はトーク責任者だけ', async () => {
    const statusOf = async (id: string) => (await adminRows('talks', (q) => q.eq('id', id)))[0].status;

    await P('memberA1').client!.from('talks').update({ status: 'trial' }).eq('id', ids.talkPendA);
    expect(await statusOf(ids.talkPendA)).toBe('pending');
    await P('leaderB').client!.from('talks').update({ status: 'trial' }).eq('id', ids.talkPendA);
    expect(await statusOf(ids.talkPendA)).toBe('pending');
    await P('leaderA').client!.from('talks').update({ status: 'trial' }).eq('id', ids.talkPendA);
    expect(await statusOf(ids.talkPendA)).toBe('trial');

    await P('leaderA').client!.from('talks').update({ status: 'standard' }).eq('id', ids.talkTrialA);
    expect(await statusOf(ids.talkTrialA)).toBe('trial');
    await P('talkOwner').client!.from('talks').update({ status: 'standard' }).eq('id', ids.talkTrialA);
    expect(await statusOf(ids.talkTrialA)).toBe('standard');

    // 2つの段階のほかの動き（飛ばす・戻す）は、だれもできない
    await P('talkOwner').client!.from('talks').update({ status: 'standard' }).eq('id', ids.talkPendB);
    expect(await statusOf(ids.talkPendB)).toBe('pending');
    await P('talkOwner').client!.from('talks').update({ status: 'trial' }).eq('id', ids.talkTrialA);
    expect(await statusOf(ids.talkTrialA)).toBe('standard');
    await P('leaderA').client!.from('talks').update({ status: 'pending' }).eq('id', ids.talkPendA);
    expect(await statusOf(ids.talkPendA)).toBe('trial');
  });

  it('研修の記録：メンバーは足せず、リーダーは足せる', async () => {
    const row = (by: string, theme: string) => ({ date: '2025-05-04', theme, lecturer: '架空', minutes: 30, content: '架空', created_by: P(by).memberId });
    await P('memberA1').client!.from('seminars').insert(row('memberA1', `${RUN}-sem-member`));
    expect(await adminRows('seminars', (q) => q.eq('theme', `${RUN}-sem-member`))).toHaveLength(0);
    await P('leaderA').client!.from('seminars').insert(row('leaderA', `${RUN}-sem-leader`));
    expect(await adminRows('seminars', (q) => q.eq('theme', `${RUN}-sem-leader`))).toHaveLength(1);
  });

  it('研修の参加者：足す・外すのは研修を作った人だけ。外した人は読めなくなる', async () => {
    const part = () => adminRows('seminar_members', (q) => q.eq('seminar_id', ids.seminar).eq('member_id', P('memberA2').memberId!));
    await P('memberA2').client!.from('seminar_members').insert({ seminar_id: ids.seminar, member_id: P('memberA2').memberId });
    expect(await part()).toHaveLength(0);
    await P('leaderB').client!.from('seminar_members').insert({ seminar_id: ids.seminar, member_id: P('memberA2').memberId });
    expect(await part()).toHaveLength(0);

    await P('leaderA').client!.from('seminar_members').insert({ seminar_id: ids.seminar, member_id: P('memberA2').memberId });
    expect(await part()).toHaveLength(1);
    expect(idsOf(await rowsOf(P('memberA2').client!, 'seminars', 'id', [ids.seminar]))).toContain(ids.seminar);

    await P('leaderA').client!.from('seminar_members').update({ removed_at: new Date().toISOString() }).eq('seminar_id', ids.seminar).eq('member_id', P('memberA2').memberId!);
    expect((await part())[0].removed_at).not.toBeNull();
    expect(await rowsOf(P('memberA2').client!, 'seminars', 'id', [ids.seminar])).toHaveLength(0);
  });

  it('一覧と設定値：メンバーは変えられず、管理者は変えられ、監査ログにだれが変えたかが残る', async () => {
    await P('memberA1').client!.from('masters').insert({ kind: 'scene', name: `${RUN}-by-member`, sort_order: 2, is_active: true });
    expect(await adminRows('masters', (q) => q.eq('name', `${RUN}-by-member`))).toHaveLength(0);
    await P('memberA1').client!.from('settings').update({ value: 99, reason: '架空' }).eq('key', settingKey);
    expect((await adminRows('settings', (q) => q.eq('key', settingKey)))[0].value).toBe(30);

    await P('leaderB').client!.from('masters').insert({ kind: 'scene', name: `${RUN}-by-admin`, sort_order: 3, is_active: true });
    const added = await adminRows('masters', (q) => q.eq('name', `${RUN}-by-admin`));
    expect(added).toHaveLength(1);
    const logs = await adminRows('audit_logs', (q) => q.eq('table_name', 'masters').eq('row_id', String(added[0].id)));
    expect(logs.some((l) => l.actor_member_id === P('leaderB').memberId && l.action === 'insert')).toBe(true);

    await P('leaderB').client!.from('settings').update({ value: 45, reason: '守りのテスト' }).eq('key', settingKey);
    expect((await adminRows('settings', (q) => q.eq('key', settingKey)))[0].value).toBe(45);
    const setLogs = await adminRows('audit_logs', (q) => q.eq('table_name', 'settings').eq('row_id', settingKey));
    expect(setLogs.some((l) => l.actor_member_id === P('leaderB').memberId && l.action === 'update')).toBe(true);
  });

  it('監査ログ：管理者でも書きかえ・削除できない', async () => {
    const before = await adminRows('audit_logs', (q) => q.eq('row_id', ids.master));
    expect(before.length).toBeGreaterThan(0);
    const target = String(before[0].id);
    await P('leaderB').client!.from('audit_logs').update({ action: 'delete' }).eq('id', target);
    await P('leaderB').client!.from('audit_logs').delete().eq('id', target);
    const after = await adminRows('audit_logs', (q) => q.eq('id', target));
    expect(after).toHaveLength(1);
    expect(after[0].action).toBe(before[0].action);
  });

  it('だれも行を削除できない（見えなくする印だけ）', async () => {
    await P('leaderA').client!.from('roleplays').delete().eq('id', ids.rpA1);
    await P('ceo').client!.from('seminars').delete().eq('id', ids.seminar);
    await P('talkOwner').client!.from('talks').delete().eq('id', ids.talkTrialA);
    await P('leaderB').client!.from('masters').delete().eq('id', ids.master);
    expect(await adminRows('roleplays', (q) => q.eq('id', ids.rpA1))).toHaveLength(1);
    expect(await adminRows('seminars', (q) => q.eq('id', ids.seminar))).toHaveLength(1);
    expect(await adminRows('talks', (q) => q.eq('id', ids.talkTrialA))).toHaveLength(1);
    expect(await adminRows('masters', (q) => q.eq('id', ids.master))).toHaveLength(1);
  });

  // 権限を足すと、ほかのテストの読める範囲が変わるので、いちばん最後に置く
  it('権限：退職した代表は与えられず、代表が与えると監査ログに残る', async () => {
    const perms = () => adminRows('permissions', (q) => q.eq('member_id', P('memberB1').memberId!));
    await P('retiredCeo').client!.from('permissions').insert({ member_id: P('memberB1').memberId, kind: 'admin', granted_by: P('retiredCeo').memberId, granted_at: new Date().toISOString() });
    expect(await perms()).toHaveLength(0);

    await P('ceo').client!.from('permissions').insert({ member_id: P('memberB1').memberId, kind: 'talk_owner', granted_by: P('ceo').memberId, granted_at: new Date().toISOString() });
    const added = await perms();
    expect(added).toHaveLength(1);
    permissionIds.push(String(added[0].id));
    const logs = await adminRows('audit_logs', (q) => q.eq('table_name', 'permissions').eq('row_id', String(added[0].id)));
    expect(logs.some((l) => l.actor_member_id === P('ceo').memberId && l.action === 'insert')).toBe(true);
  });
});
