// 守りのテスト：KPI・部下メモの区切り（取り込みの記録・日々のKPI・月の目標・アラート・名前の対応・部下メモ）
// 担当：Claude Code。Antigravity はこのファイルを変更・削除・スキップしない（計画ファイル 7章）。
// 根拠：docs/tasks/plan_kpi-memo-common_v1.md の 4章（表と権限・取り込みの記録の状態・月の目標・アラート・部下メモ）。
//       NOTES.md の決めたことの表（2026-11-05：管理者はKPIと目標を全員分読める、部下メモの対象者は同じチームだけ、代表も部下メモを書ける。
//       2026-11-04：指導の記録は役割どおりで、管理者の権限では広げない）。
//
// 動かし方：.env に SUPABASE_URL・SUPABASE_ANON_KEY・SUPABASE_SERVICE_ROLE_KEY を入れ、`npm test`。
// 開発用の Supabase プロジェクトに、架空の人（@example.test）と架空の記録を作って確かめ、最後に消す。本物のデータは使わない。
// ログインは7人（1回の実行で7回）。日付は、時差で結果が変わらないよう、今日から離れた日（2025年と2099年）だけを使う。
// テストは上から順に動く（承認などで状態が変わるため、順番を入れかえない）。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const URL = process.env.SUPABASE_URL ?? '';
const ANON = process.env.SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const RUN = `guardkm${Date.now().toString(36)}`;

type Person = {
  key: string;
  role: 'member' | 'leader' | 'mgr' | 'ceo';
  team: 'A' | 'B' | null;
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
    ['leaderB', 'leader', 'B'], // 管理者の権限を持つ（取り込んだ人）
    ['memberB1', 'member', 'B'], // 管理者の権限を持つ（取り込んでいない、もう1人の管理者）
    ['mgr1', 'mgr', null], // チームAを担当中
    ['ceo', 'ceo', null], // 管理者の権限は持たない
  ] as const
).map(([key, role, team]) => ({
  key,
  role,
  team,
  email: `${RUN}-${key.toLowerCase()}@example.test`,
  password: `${randomUUID()}Aa1!`,
}));

const P = (key: string) => {
  const p = PEOPLE.find((x) => x.key === key);
  if (!p) throw new Error(`no person ${key}`);
  return p;
};
const M = (key: string) => P(key).memberId!;
const C = (key: string) => P(key).client!;

let admin: SupabaseClient;
const ids = {
  teamA: '',
  teamB: '',
  themeMaster: '', // memo_theme
  kindMaster: '', // memo_kind
  sceneMaster: '', // scene（部下メモのテーマには使えない）
  logApprovedA: '', // 2025-05-01・チームAのファイル・承認済み（取り込んだ人 leaderB）
  logApprovedB: '', // 2025-05-01・チームBのファイル・承認済み（取り込んだ人 leaderB）
  logPending: '', // 2025-05-02・承認前（取り込んだ人 leaderB）
  logReplaced: '', // 2025-05-03・置きかえ済み（取り込んだ人 leaderB）
  logDup: '', // 2025-05-01・承認前。memberA1 が logApprovedA にもいる（承認できない）
  entryA1: '', // logApprovedA の memberA1
  entryB1: '', // logApprovedB の memberB1
  entryPending: '', // logPending の memberA1
  entryReplaced: '', // logReplaced の memberA1
  targetA1: '', // memberA1 の 2025-05 の目標
  alertA1: '', // logApprovedA の memberA1 の日ごとの総の未達
  alertLeaderA: '', // logApprovedA の leaderA 自身の未達
  alertReplaced: '', // logReplaced の memberA1 の未達
  memoA1: '', // leaderA が memberA1 について書いて送ったメモ
  memoDraft: '', // leaderA の書きかけ（対象 memberA1）
  memoMgrBoth: '', // mgr1 が leaderA と memberA1 を一緒に対象にして送ったメモ
  memoB1: '', // leaderB が memberB1 について書いて送ったメモ
  memoHidden: '', // leaderA が送って、見えなくしたメモ（対象 memberA1）
};
const auditRowIds: string[] = []; // 監査ログの片づけに使う（masters・permissions・名前の対応の id）

const anonClient = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

// 読めないとき（許可がない・エラー）は空とみなす。ログインした人の側の読み取りに使う
async function rowsOf(client: SupabaseClient, table: string, column: string, values: string[]): Promise<Record<string, unknown>[]> {
  const { data, error } = await client.from(table).select('*').in(column, values);
  if (error) return [];
  return (data ?? []) as Record<string, unknown>[];
}
const idsOf = (rows: Record<string, unknown>[]) => rows.map((r) => r.id);
const seenIds = async (key: string, table: string, values: string[], column = 'id') => idsOf(await rowsOf(C(key), table, column, values));

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
const adminOne = async (table: string, id: string) => (await adminRows(table, (q) => q.eq('id', id)))[0];

async function insertOne(table: string, row: Record<string, unknown>, idColumn = 'id'): Promise<string> {
  const { data, error } = await admin.from(table).insert(row).select(idColumn).single();
  if (error) throw error;
  return (data as Record<string, string>)[idColumn];
}

const log = (date: string, csv: string, team: string, status: string) => ({
  target_date: date,
  csv_team_name: csv,
  team_id: team,
  file_name: `${csv}時間別.csv`,
  row_count: 1,
  error_count: 0,
  totals_match: true,
  status,
  imported_by: M('leaderB'),
  approved_by: status === 'approved' ? M('leaderB') : null,
  approved_at: status === 'approved' ? new Date().toISOString() : null,
  approval_kind: status === 'approved' ? 'manual' : null,
  replaced_at: status === 'replaced' ? new Date().toISOString() : null,
});
const entry = (logId: string, member: string, date: string) => ({
  import_log_id: logId,
  member_id: M(member),
  date,
  time_slot: '10',
  total: 20,
  connected: 8,
  recall: 5,
  owner: 4,
  prospect: 1,
  apo: 1,
});
// 営業に出ない人の目標（名簿の goes_to_sales は全員 false）
const targetRow = (member: string, month: string) => ({
  member_id: M(member),
  month,
  goes_to_sales: false,
  apo_target: 30,
  working_days: 20,
  call_hours: 6,
  term: 20,
  rate_connected: 40,
  rate_recall: 30,
  rate_owner: 15,
  rate_prospect: 3,
  rate_apo_owner: 8,
  rate_adoption: 80,
});
const alertRow = (logId: string, member: string, date: string) => ({
  import_log_id: logId,
  member_id: M(member),
  date,
  compare: 'daily',
  item: 'total',
  target: 120,
  actual: 80,
  needs_response: true,
});
const memoRow = (writer: string, submitted: boolean, extra: Record<string, unknown> = {}) => ({
  date: '2025-05-01',
  created_by: M(writer),
  theme_id: ids.themeMaster,
  kind_id: ids.kindMaster,
  noticed: '架空の気づいた内容',
  guidance: '架空の指導した内容',
  submitted_at: submitted ? new Date().toISOString() : null,
  ...extra,
});

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
      retired_on: null,
    });
    if (p.team) {
      await insertOne('member_affiliations', {
        member_id: p.memberId,
        team_id: p.team === 'A' ? ids.teamA : ids.teamB,
        base: '架空の拠点',
        start_date: '2025-04-01',
        end_date: null,
      });
    }
  }
  await insertOne('mgr_assignments', {
    mgr_member_id: M('mgr1'),
    team_id: ids.teamA,
    start_date: '2025-04-01',
    end_date: null,
    assigned_by: M('ceo'),
  });
  for (const key of ['leaderB', 'memberB1']) {
    auditRowIds.push(await insertOne('permissions', { member_id: M(key), kind: 'admin', granted_by: M('ceo'), granted_at: new Date().toISOString() }));
  }

  ids.themeMaster = await insertOne('masters', { kind: 'memo_theme', name: `${RUN}-theme`, sort_order: 1, is_active: true });
  ids.kindMaster = await insertOne('masters', { kind: 'memo_kind', name: `${RUN}-kind`, sort_order: 1, is_active: true });
  ids.sceneMaster = await insertOne('masters', { kind: 'scene', name: `${RUN}-scene`, sort_order: 1, is_active: true });
  auditRowIds.push(ids.themeMaster, ids.kindMaster, ids.sceneMaster);

  ids.logApprovedA = await insertOne('import_logs', log('2025-05-01', `${RUN}-A`, ids.teamA, 'approved'));
  ids.logApprovedB = await insertOne('import_logs', log('2025-05-01', `${RUN}-B`, ids.teamB, 'approved'));
  ids.logPending = await insertOne('import_logs', log('2025-05-02', `${RUN}-A`, ids.teamA, 'pending'));
  ids.logReplaced = await insertOne('import_logs', log('2025-05-03', `${RUN}-A`, ids.teamA, 'replaced'));
  ids.logDup = await insertOne('import_logs', log('2025-05-01', `${RUN}-dup`, ids.teamA, 'pending'));

  ids.entryA1 = await insertOne('kpi_entries', entry(ids.logApprovedA, 'memberA1', '2025-05-01'));
  ids.entryB1 = await insertOne('kpi_entries', entry(ids.logApprovedB, 'memberB1', '2025-05-01'));
  ids.entryPending = await insertOne('kpi_entries', entry(ids.logPending, 'memberA1', '2025-05-02'));
  ids.entryReplaced = await insertOne('kpi_entries', entry(ids.logReplaced, 'memberA1', '2025-05-03'));
  await insertOne('kpi_entries', entry(ids.logDup, 'memberA1', '2025-05-01'));

  ids.targetA1 = await insertOne('kpi_targets', targetRow('memberA1', '2025-05-01'));

  ids.alertA1 = await insertOne('alerts', alertRow(ids.logApprovedA, 'memberA1', '2025-05-01'));
  ids.alertLeaderA = await insertOne('alerts', alertRow(ids.logApprovedA, 'leaderA', '2025-05-01'));
  ids.alertReplaced = await insertOne('alerts', alertRow(ids.logReplaced, 'memberA1', '2025-05-03'));

  const memoWith = async (row: Record<string, unknown>, targets: string[]) => {
    const id = await insertOne('subordinate_memos', row);
    for (const t of targets) {
      const { error } = await admin.from('subordinate_memo_targets').insert({ memo_id: id, member_id: M(t) });
      if (error) throw error;
    }
    return id;
  };
  ids.memoA1 = await memoWith(memoRow('leaderA', true), ['memberA1']);
  ids.memoDraft = await memoWith(memoRow('leaderA', false), ['memberA1']);
  ids.memoMgrBoth = await memoWith(memoRow('mgr1', true), ['leaderA', 'memberA1']);
  ids.memoB1 = await memoWith(memoRow('leaderB', true), ['memberB1']);
  ids.memoHidden = await memoWith(memoRow('leaderA', true, { hidden_at: new Date().toISOString() }), ['memberA1']);

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
  if (memberIds.length) {
    const { data: memos } = await admin.from('subordinate_memos').select('id').in('created_by', memberIds);
    const memoIds = (memos ?? []).map((m) => String(m.id));
    if (memoIds.length) warnIf('subordinate_memo_targets', (await admin.from('subordinate_memo_targets').delete().in('memo_id', memoIds)).error);
    warnIf('subordinate_memo_targets（対象者の分）', (await admin.from('subordinate_memo_targets').delete().in('member_id', memberIds)).error);
    warnIf('subordinate_memos', (await admin.from('subordinate_memos').delete().in('created_by', memberIds)).error);
    warnIf('alerts', (await admin.from('alerts').delete().in('member_id', memberIds)).error);
    warnIf('kpi_entries', (await admin.from('kpi_entries').delete().in('member_id', memberIds)).error);
    warnIf('import_logs', (await admin.from('import_logs').delete().in('imported_by', memberIds)).error);
    warnIf('kpi_targets', (await admin.from('kpi_targets').delete().in('member_id', memberIds)).error);
    const { data: memberMaps } = await admin.from('cti_member_map').select('id').in('member_id', memberIds);
    for (const m of memberMaps ?? []) auditRowIds.push(String(m.id));
    warnIf('cti_member_map', (await admin.from('cti_member_map').delete().in('member_id', memberIds)).error);
  }
  const { data: nameMaps } = await admin.from('cti_member_map').select('id').like('cti_name', `${RUN}%`);
  for (const m of nameMaps ?? []) auditRowIds.push(String(m.id));
  warnIf('cti_member_map（名前の分）', (await admin.from('cti_member_map').delete().like('cti_name', `${RUN}%`)).error);
  const { data: teamMaps } = await admin.from('cti_team_map').select('id').like('csv_team_name', `${RUN}%`);
  for (const m of teamMaps ?? []) auditRowIds.push(String(m.id));
  warnIf('cti_team_map', (await admin.from('cti_team_map').delete().like('csv_team_name', `${RUN}%`)).error);
  warnIf('masters', (await admin.from('masters').delete().like('name', `${RUN}%`)).error);
  if (memberIds.length) {
    const { data: runPerms } = await admin.from('permissions').select('id').in('member_id', memberIds);
    for (const p of runPerms ?? []) auditRowIds.push(String(p.id));
    warnIf('permissions', (await admin.from('permissions').delete().in('member_id', memberIds)).error);
    warnIf('mgr_assignments', (await admin.from('mgr_assignments').delete().in('mgr_member_id', memberIds)).error);
    warnIf('member_affiliations', (await admin.from('member_affiliations').delete().in('member_id', memberIds)).error);
    warnIf('members', (await admin.from('members').delete().in('id', memberIds)).error);
  }
  if (teams.length) warnIf('teams', (await admin.from('teams').delete().in('id', teams)).error);
  // 片づけの削除で増えた分も含めて、この回の監査ログを消す（管理用の鍵だけが消せる）
  if (auditRowIds.length) warnIf('audit_logs', (await admin.from('audit_logs').delete().in('row_id', [...new Set(auditRowIds)])).error);
  for (const p of PEOPLE) {
    if (p.authId) warnIf(`利用者 ${p.key}`, (await admin.auth.admin.deleteUser(p.authId)).error);
  }
}, 180_000);

describe('KPI：読める範囲', () => {
  it('ログインしていない人は、KPIと部下メモの表をどれも読めない', async () => {
    const c = anonClient();
    expect(await rowsOf(c, 'import_logs', 'id', [ids.logApprovedA])).toHaveLength(0);
    expect(await rowsOf(c, 'kpi_entries', 'id', [ids.entryA1])).toHaveLength(0);
    expect(await rowsOf(c, 'kpi_targets', 'id', [ids.targetA1])).toHaveLength(0);
    expect(await rowsOf(c, 'alerts', 'id', [ids.alertA1])).toHaveLength(0);
    expect(await rowsOf(c, 'cti_member_map', 'member_id', [M('memberA1')])).toHaveLength(0);
    expect(await rowsOf(c, 'cti_team_map', 'team_id', [ids.teamA])).toHaveLength(0);
    expect(await rowsOf(c, 'subordinate_memos', 'id', [ids.memoA1])).toHaveLength(0);
    expect(await rowsOf(c, 'subordinate_memo_targets', 'memo_id', [ids.memoA1])).toHaveLength(0);
  });

  it('承認済みの日々のKPI：本人・上席・管理者は読め、同じチームのほかのメンバーは読めない', async () => {
    const both = [ids.entryA1, ids.entryB1];
    expect(await seenIds('memberA1', 'kpi_entries', both)).toEqual([ids.entryA1]);
    expect(await seenIds('memberA2', 'kpi_entries', both)).toEqual([]);
    expect(await seenIds('leaderA', 'kpi_entries', both)).toEqual([ids.entryA1]);
    expect(await seenIds('mgr1', 'kpi_entries', both)).toEqual([ids.entryA1]);
    expect(await seenIds('ceo', 'kpi_entries', both)).toEqual(expect.arrayContaining(both));
    // 管理者の権限では、ほかのチームの分も読める（2026-11-05 本人の選択）
    expect(await seenIds('leaderB', 'kpi_entries', both)).toEqual(expect.arrayContaining(both));
    expect(await seenIds('memberB1', 'kpi_entries', both)).toEqual(expect.arrayContaining(both));
  });

  it('承認前の日々のKPIは、取り込んだ管理者だけが読める', async () => {
    expect(await seenIds('leaderB', 'kpi_entries', [ids.entryPending])).toEqual([ids.entryPending]);
    for (const key of ['memberB1', 'leaderA', 'mgr1', 'ceo', 'memberA1']) {
      expect(await seenIds(key, 'kpi_entries', [ids.entryPending])).toEqual([]);
    }
  });

  it('置きかえた取り込みの日々のKPIは、だれも読めない（消さずに残る）', async () => {
    for (const key of ['leaderB', 'memberB1', 'leaderA', 'ceo', 'memberA1']) {
      expect(await seenIds(key, 'kpi_entries', [ids.entryReplaced])).toEqual([]);
    }
    expect(await adminOne('kpi_entries', ids.entryReplaced)).toBeTruthy();
  });

  it('取り込みの記録と名前の対応は、管理者の権限がある人だけが読める', async () => {
    expect(await seenIds('memberB1', 'import_logs', [ids.logApprovedA])).toEqual([ids.logApprovedA]);
    for (const key of ['leaderA', 'mgr1', 'ceo', 'memberA1']) {
      expect(await seenIds(key, 'import_logs', [ids.logApprovedA])).toEqual([]);
    }
  });

  it('月の目標：本人・上席・管理者は読め、同じチームのほかのメンバーは読めない', async () => {
    for (const key of ['memberA1', 'leaderA', 'mgr1', 'ceo', 'leaderB']) {
      expect(await seenIds(key, 'kpi_targets', [ids.targetA1])).toEqual([ids.targetA1]);
    }
    expect(await seenIds('memberA2', 'kpi_targets', [ids.targetA1])).toEqual([]);
  });

  it('アラート：上席だけが読める。本人・ほかのメンバー・ほかのチームの管理者は読めない。置きかえた分はだれも読めない', async () => {
    for (const key of ['leaderA', 'mgr1', 'ceo']) {
      expect(await seenIds(key, 'alerts', [ids.alertA1])).toEqual([ids.alertA1]);
    }
    for (const key of ['memberA1', 'memberA2', 'leaderB', 'memberB1']) {
      expect(await seenIds(key, 'alerts', [ids.alertA1])).toEqual([]);
    }
    for (const key of ['leaderA', 'ceo']) {
      expect(await seenIds(key, 'alerts', [ids.alertReplaced])).toEqual([]);
    }
    // リーダー自身のアラートは、そのリーダーには見えない（上席の判定から自分は外す）
    expect(await seenIds('leaderA', 'alerts', [ids.alertLeaderA])).toEqual([]);
    expect(await seenIds('mgr1', 'alerts', [ids.alertLeaderA])).toEqual([ids.alertLeaderA]);
  });
});

describe('KPI：書ける範囲', () => {
  it('取り込みの記録：管理者の権限がない人は作れない。管理者は自分を取り込んだ人にして、承認前でだけ作れる', async () => {
    await C('ceo').from('import_logs').insert({ ...log('2025-06-01', `${RUN}-byceo`, ids.teamA, 'pending'), imported_by: M('ceo') });
    expect(await adminRows('import_logs', (q) => q.eq('csv_team_name', `${RUN}-byceo`))).toHaveLength(0);

    await C('memberB1').from('import_logs').insert({ ...log('2025-06-01', `${RUN}-other`, ids.teamA, 'pending'), imported_by: M('leaderB') });
    expect(await adminRows('import_logs', (q) => q.eq('csv_team_name', `${RUN}-other`))).toHaveLength(0);

    await C('memberB1').from('import_logs').insert({ ...log('2025-06-01', `${RUN}-approved`, ids.teamA, 'approved'), imported_by: M('memberB1') });
    expect(await adminRows('import_logs', (q) => q.eq('csv_team_name', `${RUN}-approved`))).toHaveLength(0);

    await C('memberB1').from('import_logs').insert({ ...log('2025-06-01', `${RUN}-own`, ids.teamA, 'pending'), imported_by: M('memberB1') });
    expect(await adminRows('import_logs', (q) => q.eq('csv_team_name', `${RUN}-own`))).toHaveLength(1);
  });

  it('同じ日・同じチーム名で、置きかえていない取り込みの記録は1つまで', async () => {
    const { error } = await admin.from('import_logs').insert(log('2025-05-01', `${RUN}-A`, ids.teamA, 'pending'));
    expect(error).not.toBeNull();
  });

  it('日々のKPI：取り込んだ管理者が、自分の承認前の記録にだけ入れられる。直す・消すはだれもできない', async () => {
    const own = (await adminRows('import_logs', (q) => q.eq('csv_team_name', `${RUN}-own`)))[0];
    await C('memberB1').from('kpi_entries').insert({ ...entry(String(own.id), 'memberA2', '2025-06-01'), time_slot: '11' });
    expect(await adminRows('kpi_entries', (q) => q.eq('import_log_id', own.id))).toHaveLength(1);

    // ほかの管理者の承認前の記録・管理者でない人は入れられない
    await C('memberB1').from('kpi_entries').insert({ ...entry(ids.logPending, 'memberA2', '2025-05-02'), time_slot: '12' });
    await C('leaderA').from('kpi_entries').insert({ ...entry(ids.logPending, 'memberA2', '2025-05-02'), time_slot: '13' });
    expect(await adminRows('kpi_entries', (q) => q.eq('import_log_id', ids.logPending).eq('member_id', M('memberA2')))).toHaveLength(0);

    // 承認済みの記録にも入れられない（取り込んだ人でも）
    await C('leaderB').from('kpi_entries').insert({ ...entry(ids.logApprovedA, 'memberA2', '2025-05-01'), time_slot: '14' });
    expect(await adminRows('kpi_entries', (q) => q.eq('import_log_id', ids.logApprovedA).eq('member_id', M('memberA2')))).toHaveLength(0);

    await C('leaderB').from('kpi_entries').update({ total: 999 }).eq('id', ids.entryPending);
    await C('leaderB').from('kpi_entries').delete().eq('id', ids.entryPending);
    const after = await adminOne('kpi_entries', ids.entryPending);
    expect(after).toBeTruthy();
    expect(after.total).toBe(20);
  });

  it('承認：取り込んだ人だけができる。ほかの管理者はできない', async () => {
    await C('memberB1').from('import_logs').update({ status: 'approved' }).eq('id', ids.logPending);
    expect((await adminOne('import_logs', ids.logPending)).status).toBe('pending');

    await C('leaderB').from('import_logs').update({ status: 'approved' }).eq('id', ids.logPending);
    const approved = await adminOne('import_logs', ids.logPending);
    expect(approved.status).toBe('approved');
    expect(approved.approved_by).toBe(M('leaderB'));
    expect(approved.approved_at).not.toBeNull();
    // 承認したので、上席から読めるようになる
    expect(await seenIds('leaderA', 'kpi_entries', [ids.entryPending])).toEqual([ids.entryPending]);
  });

  it('承認済みを承認前に戻す・置きかえ済みを戻すことは、だれもできない', async () => {
    await C('leaderB').from('import_logs').update({ status: 'pending' }).eq('id', ids.logPending);
    expect((await adminOne('import_logs', ids.logPending)).status).toBe('approved');
    await C('leaderB').from('import_logs').update({ status: 'approved' }).eq('id', ids.logReplaced);
    expect((await adminOne('import_logs', ids.logReplaced)).status).toBe('replaced');
  });

  it('同じ人が同じ日のほかの承認済みの取り込みにいるときは、承認できない。置きかえはどの管理者でもできる', async () => {
    await C('leaderB').from('import_logs').update({ status: 'approved' }).eq('id', ids.logDup);
    expect((await adminOne('import_logs', ids.logDup)).status).toBe('pending');

    await C('memberB1').from('import_logs').update({ status: 'replaced' }).eq('id', ids.logDup);
    const replaced = await adminOne('import_logs', ids.logDup);
    expect(replaced.status).toBe('replaced');
    expect(replaced.replaced_at).not.toBeNull();
  });

  it('名前の対応：管理者の権限がある人だけが書け、監査ログに残る', async () => {
    await C('ceo').from('cti_member_map').insert({ cti_name: `${RUN}-byceo`, member_id: M('memberA1'), valid_from: '2025-04-01', created_by: M('ceo') });
    expect(await adminRows('cti_member_map', (q) => q.eq('cti_name', `${RUN}-byceo`))).toHaveLength(0);

    await C('memberB1').from('cti_member_map').insert({ cti_name: `${RUN}-a1`, member_id: M('memberA1'), valid_from: '2025-04-01', created_by: M('memberB1') });
    // 名簿にいない人の名前は「取り込まない名前」として、member_id を空で入れられる
    await C('memberB1').from('cti_member_map').insert({ cti_name: `${RUN}-skip`, member_id: null, valid_from: '2025-04-01', created_by: M('memberB1') });
    await C('memberB1').from('cti_team_map').insert({ csv_team_name: `${RUN}-csvA`, team_id: ids.teamA, valid_from: '2025-04-01', created_by: M('memberB1') });
    const map = (await adminRows('cti_member_map', (q) => q.eq('cti_name', `${RUN}-a1`)))[0];
    expect(map).toBeTruthy();
    expect(await adminRows('cti_member_map', (q) => q.eq('cti_name', `${RUN}-skip`))).toHaveLength(1);
    expect(await adminRows('cti_team_map', (q) => q.eq('csv_team_name', `${RUN}-csvA`))).toHaveLength(1);

    const logs = await adminRows('audit_logs', (q) => q.eq('table_name', 'cti_member_map').eq('row_id', String(map.id)));
    expect(logs.some((l) => l.action === 'insert' && l.actor_member_id === M('memberB1'))).toBe(true);
    expect(await seenIds('leaderA', 'cti_member_map', [String(map.id)])).toEqual([]);
  });

  it('月の目標：本人だけが入れて直せる。営業に出るかは名簿の値になる', async () => {
    // 名簿では営業に出ない人。画面から「出る」と送っても、名簿の値（出ない）になる
    await C('memberA2').from('kpi_targets').insert({ ...targetRow('memberA2', '2099-01-01'), goes_to_sales: true });
    const own = (await adminRows('kpi_targets', (q) => q.eq('member_id', M('memberA2')).eq('month', '2099-01-01')))[0];
    expect(own).toBeTruthy();
    expect(own.goes_to_sales).toBe(false);

    await C('memberA2').from('kpi_targets').insert(targetRow('memberA1', '2099-01-01'));
    await C('leaderA').from('kpi_targets').insert(targetRow('memberA1', '2099-02-01'));
    expect(await adminRows('kpi_targets', (q) => q.eq('member_id', M('memberA1')).in('month', ['2099-01-01', '2099-02-01']))).toHaveLength(0);

    // 上席は見るだけ（直せない）
    await C('leaderA').from('kpi_targets').update({ apo_target: 1 }).eq('id', ids.targetA1);
    expect((await adminOne('kpi_targets', ids.targetA1)).apo_target).toBe(30);
  });

  it('月の目標：月が始まってから直すと、前の値が控えに残り「修正あり」になる。控えは画面から書きかえられない', async () => {
    await C('memberA1').from('kpi_targets').update({ apo_target: 40, history: [], revised_at: null }).eq('id', ids.targetA1);
    const revised = await adminOne('kpi_targets', ids.targetA1);
    expect(revised.apo_target).toBe(40);
    expect(revised.revised_at).not.toBeNull();
    const history = revised.history as { values: Record<string, unknown> }[];
    expect(history).toHaveLength(1);
    expect(Number(history[0].values.apo_target)).toBe(30);

    // 控えを空に書きかえようとしても、残る
    await C('memberA1').from('kpi_targets').update({ history: [] }).eq('id', ids.targetA1);
    expect((await adminOne('kpi_targets', ids.targetA1)).history as unknown[]).toHaveLength(1);

    // 月が始まる前の目標は、印をつけずに直せる
    const future = (await adminRows('kpi_targets', (q) => q.eq('member_id', M('memberA2')).eq('month', '2099-01-01')))[0];
    await C('memberA2').from('kpi_targets').update({ apo_target: 35 }).eq('id', future.id);
    const futureAfter = await adminOne('kpi_targets', String(future.id));
    expect(futureAfter.apo_target).toBe(35);
    expect(futureAfter.revised_at).toBeNull();
    expect(futureAfter.history as unknown[]).toHaveLength(0);
  });

  it('アラート：入れられるのは、承認した取り込みの分を承認した管理者だけ', async () => {
    const row = { ...alertRow(ids.logApprovedA, 'memberA2', '2025-05-01'), item: 'connected' };
    await C('memberB1').from('alerts').insert(row);
    await C('leaderA').from('alerts').insert(row);
    expect(await adminRows('alerts', (q) => q.eq('import_log_id', ids.logApprovedA).eq('member_id', M('memberA2')))).toHaveLength(0);
    await C('leaderB').from('alerts').insert(row);
    expect(await adminRows('alerts', (q) => q.eq('import_log_id', ids.logApprovedA).eq('member_id', M('memberA2')))).toHaveLength(1);
  });

  it('アラートの対応：同じチームのリーダーだけが、理由をつけて記録できる。MGR・代表は見るだけ', async () => {
    await C('mgr1').from('alerts').update({ response: 'done', response_reason: `${RUN}-mgr` }).eq('id', ids.alertA1);
    await C('ceo').from('alerts').update({ response: 'done', response_reason: `${RUN}-ceo` }).eq('id', ids.alertA1);
    expect((await adminOne('alerts', ids.alertA1)).response).toBeNull();

    // 理由がないと記録できない
    await C('leaderA').from('alerts').update({ response: 'unneeded', response_reason: ' ' }).eq('id', ids.alertA1);
    expect((await adminOne('alerts', ids.alertA1)).response).toBeNull();

    await C('leaderA').from('alerts').update({ response: 'done', response_reason: `${RUN}-声かけした` }).eq('id', ids.alertA1);
    const done = await adminOne('alerts', ids.alertA1);
    expect(done.response).toBe('done');
    expect(done.responded_by).toBe(M('leaderA'));
    expect(done.responded_at).not.toBeNull();

    // 判定の数字は直せない
    await C('leaderA').from('alerts').update({ target: 1 }).eq('id', ids.alertA1);
    expect(Number((await adminOne('alerts', ids.alertA1)).target)).toBe(120);

    // 自分のアラートには記録できない
    await C('leaderA').from('alerts').update({ response: 'unneeded', response_reason: `${RUN}-self` }).eq('id', ids.alertLeaderA);
    expect((await adminOne('alerts', ids.alertLeaderA)).response).toBeNull();
  });
});

describe('部下メモ：読める範囲', () => {
  it('書きかけは、書いた人だけが読める', async () => {
    expect(await seenIds('leaderA', 'subordinate_memos', [ids.memoDraft])).toEqual([ids.memoDraft]);
    for (const key of ['mgr1', 'ceo', 'memberA1']) {
      expect(await seenIds(key, 'subordinate_memos', [ids.memoDraft])).toEqual([]);
    }
  });

  it('送ったメモは、書いた人と対象者の上席が読める。本人・ほかのメンバー・管理者の権限では読めない', async () => {
    for (const key of ['leaderA', 'mgr1', 'ceo']) {
      expect(await seenIds(key, 'subordinate_memos', [ids.memoA1])).toEqual([ids.memoA1]);
      expect(await rowsOf(C(key), 'subordinate_memo_targets', 'memo_id', [ids.memoA1])).toHaveLength(1);
    }
    for (const key of ['memberA1', 'memberA2', 'leaderB', 'memberB1']) {
      expect(await seenIds(key, 'subordinate_memos', [ids.memoA1])).toEqual([]);
      expect(await rowsOf(C(key), 'subordinate_memo_targets', 'memo_id', [ids.memoA1])).toHaveLength(0);
    }
    expect(await seenIds('leaderA', 'subordinate_memos', [ids.memoB1])).toEqual([]);
    expect(await seenIds('leaderB', 'subordinate_memos', [ids.memoB1])).toEqual([ids.memoB1]);
  });

  it('対象者に自分が入っているメモは読めない（リーダーとメンバーが一緒に対象のメモを、そのリーダーは読めない）', async () => {
    expect(await seenIds('leaderA', 'subordinate_memos', [ids.memoMgrBoth])).toEqual([]);
    expect(await rowsOf(C('leaderA'), 'subordinate_memo_targets', 'memo_id', [ids.memoMgrBoth])).toHaveLength(0);
    expect(await seenIds('memberA1', 'subordinate_memos', [ids.memoMgrBoth])).toEqual([]);
    expect(await seenIds('mgr1', 'subordinate_memos', [ids.memoMgrBoth])).toEqual([ids.memoMgrBoth]);
    expect(await seenIds('ceo', 'subordinate_memos', [ids.memoMgrBoth])).toEqual([ids.memoMgrBoth]);
  });

  it('見えなくしたメモは、書いた人だけが読める', async () => {
    expect(await seenIds('leaderA', 'subordinate_memos', [ids.memoHidden])).toEqual([ids.memoHidden]);
    expect(await seenIds('mgr1', 'subordinate_memos', [ids.memoHidden])).toEqual([]);
  });
});

describe('部下メモ：書ける範囲', () => {
  const memoIdsBy = async (writer: string, noticed: string) =>
    (await adminRows('subordinate_memos', (q) => q.eq('created_by', M(writer)).eq('noticed', noticed))).map((r) => String(r.id));

  it('書けるのはリーダー・MGR・代表で、書いた人を自分にしたときだけ', async () => {
    await C('memberA1').from('subordinate_memos').insert(memoRow('memberA1', false, { noticed: `${RUN}-by-member` }));
    expect(await memoIdsBy('memberA1', `${RUN}-by-member`)).toHaveLength(0);

    await C('leaderA').from('subordinate_memos').insert(memoRow('mgr1', false, { noticed: `${RUN}-as-other` }));
    expect(await memoIdsBy('mgr1', `${RUN}-as-other`)).toHaveLength(0);

    // 代表も書ける（2026-11-05 本人の選択）
    await C('ceo').from('subordinate_memos').insert(memoRow('ceo', false, { noticed: `${RUN}-by-ceo` }));
    expect(await memoIdsBy('ceo', `${RUN}-by-ceo`)).toHaveLength(1);
  });

  it('対象者：自分は選べない。上席として見ている人だけ。1つのメモに選べるのは今同じチームの人だけ', async () => {
    const [ceoMemo] = await memoIdsBy('ceo', `${RUN}-by-ceo`);
    const targetsOf = async (memo: string) => (await adminRows('subordinate_memo_targets', (q) => q.eq('memo_id', memo))).map((r) => r.member_id);

    await C('ceo').from('subordinate_memo_targets').insert({ memo_id: ceoMemo, member_id: M('ceo') });
    await C('ceo').from('subordinate_memo_targets').insert({ memo_id: ceoMemo, member_id: M('memberA1') });
    await C('ceo').from('subordinate_memo_targets').insert({ memo_id: ceoMemo, member_id: M('memberB1') }); // ちがうチーム
    await C('ceo').from('subordinate_memo_targets').insert({ memo_id: ceoMemo, member_id: M('memberA2') });
    const targets = await targetsOf(ceoMemo);
    expect(targets).toEqual(expect.arrayContaining([M('memberA1'), M('memberA2')]));
    expect(targets).not.toContain(M('ceo'));
    expect(targets).not.toContain(M('memberB1'));

    // リーダーは、ほかのチームの人を対象にできない。ほかの人のメモに対象者を足せない
    await C('leaderA').from('subordinate_memo_targets').insert({ memo_id: ids.memoDraft, member_id: M('memberB1') });
    await C('leaderA').from('subordinate_memo_targets').insert({ memo_id: ids.memoDraft, member_id: M('leaderA') });
    await C('leaderA').from('subordinate_memo_targets').insert({ memo_id: ceoMemo, member_id: M('memberA2') });
    expect(await targetsOf(ids.memoDraft)).toEqual([M('memberA1')]);

    // 対象者を外すのは、消さずに removed_at を入れる（書いた人だけ）
    await C('mgr1').from('subordinate_memo_targets').update({ removed_at: new Date().toISOString() }).eq('memo_id', ceoMemo).eq('member_id', M('memberA2'));
    expect((await adminRows('subordinate_memo_targets', (q) => q.eq('memo_id', ceoMemo).eq('member_id', M('memberA2'))))[0].removed_at).toBeNull();
    await C('ceo').from('subordinate_memo_targets').update({ removed_at: new Date().toISOString() }).eq('memo_id', ceoMemo).eq('member_id', M('memberA2'));
    expect((await adminRows('subordinate_memo_targets', (q) => q.eq('memo_id', ceoMemo).eq('member_id', M('memberA2'))))[0].removed_at).not.toBeNull();
    await C('ceo').from('subordinate_memo_targets').delete().eq('memo_id', ceoMemo);
    expect(await targetsOf(ceoMemo)).toHaveLength(2);
  });

  it('送るとき：対象者・テーマ・種類と、気づいた内容か指導した内容が要る。テーマは部下メモのテーマの一覧から', async () => {
    const noTarget = `${RUN}-no-target`;
    await C('leaderA').from('subordinate_memos').insert(memoRow('leaderA', false, { noticed: noTarget }));
    const [id] = await memoIdsBy('leaderA', noTarget);
    expect(id).toBeTruthy();
    await C('leaderA').from('subordinate_memos').update({ submitted_at: new Date().toISOString() }).eq('id', id);
    expect((await adminOne('subordinate_memos', id)).submitted_at).toBeNull();

    const { error: tErr } = await C('leaderA').from('subordinate_memo_targets').insert({ memo_id: id, member_id: M('memberA2') });
    expect(tErr).toBeNull();
    await C('leaderA').from('subordinate_memos').update({ submitted_at: new Date().toISOString(), noticed: ' ', guidance: ' ' }).eq('id', id);
    expect((await adminOne('subordinate_memos', id)).submitted_at).toBeNull();

    await C('leaderA').from('subordinate_memos').update({ theme_id: ids.sceneMaster }).eq('id', id);
    expect((await adminOne('subordinate_memos', id)).theme_id).toBe(ids.themeMaster);

    await C('leaderA').from('subordinate_memos').update({ submitted_at: new Date().toISOString() }).eq('id', id);
    expect((await adminOne('subordinate_memos', id)).submitted_at).not.toBeNull();
  });

  it('直す・見えなくするのは書いた人だけ。消すことはだれもできない', async () => {
    await C('mgr1').from('subordinate_memos').update({ guidance: `${RUN}-by-mgr` }).eq('id', ids.memoA1);
    await C('ceo').from('subordinate_memos').update({ hidden_at: new Date().toISOString() }).eq('id', ids.memoA1);
    const kept = await adminOne('subordinate_memos', ids.memoA1);
    expect(kept.guidance).not.toBe(`${RUN}-by-mgr`);
    expect(kept.hidden_at).toBeNull();

    await C('leaderA').from('subordinate_memos').update({ action_check: 'o', result_check: 'd', checked_on: '2025-05-15' }).eq('id', ids.memoA1);
    const checked = await adminOne('subordinate_memos', ids.memoA1);
    expect(checked.action_check).toBe('o');
    expect(checked.result_check).toBe('d');

    // 書いた人は変えられない
    await C('leaderA').from('subordinate_memos').update({ created_by: M('mgr1') }).eq('id', ids.memoA1);
    expect((await adminOne('subordinate_memos', ids.memoA1)).created_by).toBe(M('leaderA'));

    await C('leaderA').from('subordinate_memos').delete().eq('id', ids.memoA1);
    expect(await adminOne('subordinate_memos', ids.memoA1)).toBeTruthy();
  });
});
