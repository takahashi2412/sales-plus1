// 守りのテスト：カルテ第1版の区切り（退職した人の記録を読める人・退職した人を対象にした新しい記録・ロープレの過去の記録の印・名簿と権限を直せる人）
// 担当：Claude Code。Antigravity はこのファイルを変更・削除・スキップしない（計画ファイル 7章）。
// 根拠：docs/tasks/plan_karte-common_v1.md の 4章「表と権限の直し」。
//       NOTES.md の決めたことの表（2026-11-07：退職した人の記録は、最後にいたチームの今のリーダー・担当MGRと代表が読める。
//       権限を与える・外すのは管理者と代表。2026-11-04：指導の記録は役割どおりで、管理者の権限では広げない）。
//
// 動かし方：.env に SUPABASE_URL・SUPABASE_ANON_KEY・SUPABASE_SERVICE_ROLE_KEY を入れ、`npm test`。
// 開発用の Supabase プロジェクトに、架空の人（@example.test）と架空の記録を作って確かめ、最後に消す。本物のデータは使わない。
// ログインは3人（1回の実行で3回。守りのテスト全体で29回）。日付は、時差で結果が変わらないよう、今日から離れた日（2025年）だけを使う。
// テストは上から順に動く（最後に leaderA に管理者の権限を与えるため、順番を入れかえない）。
// 「最後の1人の管理者は外せない」は、開発用のプロジェクトにほかの架空の管理者がいるため、ここでは確かめない（画面の確かめと SQL のレビューで確かめる）。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const URL = process.env.SUPABASE_URL ?? '';
const ANON = process.env.SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const RUN = `guardkt${Date.now().toString(36)}`;

type Aff = { team: 'A' | 'B'; start: string; end: string | null };
type Person = {
  key: string;
  role: 'member' | 'leader' | 'mgr' | 'ceo';
  affs: Aff[];
  retiredOn: string | null;
  login: boolean;
  email: string;
  password: string;
  authId?: string;
  memberId?: string;
  client?: SupabaseClient;
};

const PEOPLE: Person[] = (
  [
    // [key, role, 所属の履歴, 退職日, ログインするか]
    ['leaderA', 'leader', [{ team: 'A', start: '2025-04-01', end: null }], null, true], // 架空チームAの今のリーダー（管理者の権限は、最後のテストで与える）
    ['memberA1', 'member', [{ team: 'A', start: '2025-04-01', end: null }], null, false],
    // 架空チームAにいて退職した人（最後のチーム＝A）
    ['retiredA', 'member', [{ team: 'A', start: '2025-04-01', end: '2025-06-30' }], '2025-06-30', false],
    // A から B へ異動して退職した人（最後のチーム＝B）
    ['movedRetired', 'member', [
      { team: 'A', start: '2025-04-01', end: '2025-05-31' },
      { team: 'B', start: '2025-06-01', end: '2025-06-30' },
    ], '2025-06-30', false],
    ['leaderB', 'leader', [{ team: 'B', start: '2025-04-01', end: null }], null, true], // 管理者の権限は持たない
    ['mgr1', 'mgr', [], null, true], // 架空チームAを担当中
    ['ceo', 'ceo', [], null, false], // 退職した人についての記録を書いた人
  ] as const
).map(([key, role, affs, retiredOn, login]) => ({
  key,
  role,
  affs: affs as unknown as Aff[],
  retiredOn,
  login,
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
const themeNo = 900000 + Math.floor(Math.random() * 90000);
const ids = {
  teamA: '',
  teamB: '',
  theme: '', // roleplay_themes
  themeMaster: '', // memo_theme
  kindMaster: '', // memo_kind
  logA: '', // 2025-06-02・チームAのファイル・承認済み（退職した retiredA の分）
  logB: '', // 2025-06-10・チームBのファイル・承認済み（異動して退職した movedRetired の分）
  entryRetiredA: '',
  entryMoved: '',
  rpRetiredA: '', // ceo が retiredA に行ったロープレ（送った）
  rpMoved: '', // ceo が movedRetired に行ったロープレ（送った）
  memoRetiredA: '', // ceo が retiredA について書いて送った部下メモ
  memoMoved: '', // ceo が movedRetired について書いて送った部下メモ
  permLeaderA: '', // 最後のテストで leaderA に与える管理者の権限
};
// 監査ログの片づけに使う（名簿・所属・担当・チーム・権限・一覧の id）
const auditRowIds: string[] = [];

const anonClient = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

// 読めないとき（許可がない・エラー）は空とみなす。ログインした人の側の読み取りに使う
async function rowsOf(client: SupabaseClient, table: string, column: string, values: string[]): Promise<Record<string, unknown>[]> {
  const { data, error } = await client.from(table).select('*').in(column, values);
  if (error) return [];
  return (data ?? []) as Record<string, unknown>[];
}
const seenIds = async (key: string, table: string, values: string[], column = 'id') =>
  (await rowsOf(C(key), table, column, values)).map((r) => r[column]);

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

const log = (date: string, team: 'A' | 'B') => ({
  target_date: date,
  csv_team_name: `${RUN}-${team}`,
  team_id: team === 'A' ? ids.teamA : ids.teamB,
  file_name: `${RUN}-${team}時間別.csv`,
  row_count: 1,
  error_count: 0,
  totals_match: true,
  status: 'approved',
  imported_by: M('leaderB'),
  approved_by: M('leaderB'),
  approved_at: new Date().toISOString(),
  approval_kind: 'manual',
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
const rp = (runner: string, member: string, date: string, extra: Record<string, unknown> = {}) => ({
  date,
  runner_member_id: M(runner),
  member_id: M(member),
  time_slot: '10',
  kind: 'apo',
  theme_id: ids.theme,
  minutes: 10,
  repeat_count: 1,
  pass_result: 'o',
  fixed_point: '架空の直した点',
  submitted_at: new Date().toISOString(),
  ...extra,
});
const memoRow = (writer: string, date: string, extra: Record<string, unknown> = {}) => ({
  date,
  created_by: M(writer),
  theme_id: ids.themeMaster,
  kind_id: ids.kindMaster,
  noticed: '架空の気づいた内容',
  guidance: '架空の指導した内容',
  ...extra,
});

beforeAll(async () => {
  if (!URL || !ANON || !SERVICE) {
    throw new Error('.env に SUPABASE_URL・SUPABASE_ANON_KEY・SUPABASE_SERVICE_ROLE_KEY がありません');
  }
  admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  ids.teamA = await insertOne('teams', { name: `${RUN}-A` });
  ids.teamB = await insertOne('teams', { name: `${RUN}-B` });
  auditRowIds.push(ids.teamA, ids.teamB);

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
      retired_on: p.retiredOn,
    });
    auditRowIds.push(p.memberId);
    for (const a of p.affs) {
      auditRowIds.push(
        await insertOne('member_affiliations', {
          member_id: p.memberId,
          team_id: a.team === 'A' ? ids.teamA : ids.teamB,
          base: '架空の拠点',
          start_date: a.start,
          end_date: a.end,
        }),
      );
    }
  }
  auditRowIds.push(
    await insertOne('mgr_assignments', {
      mgr_member_id: M('mgr1'),
      team_id: ids.teamA,
      start_date: '2025-04-01',
      end_date: null,
      assigned_by: M('ceo'),
    }),
  );

  ids.theme = await insertOne('roleplay_themes', { no: themeNo, stage: 1, name: `${RUN}-theme`, kind: 'apo', pass_example: '架空の例', is_active: true });
  ids.themeMaster = await insertOne('masters', { kind: 'memo_theme', name: `${RUN}-theme`, sort_order: 1, is_active: true });
  ids.kindMaster = await insertOne('masters', { kind: 'memo_kind', name: `${RUN}-kind`, sort_order: 1, is_active: true });
  auditRowIds.push(ids.themeMaster, ids.kindMaster);

  ids.logA = await insertOne('import_logs', log('2025-06-02', 'A'));
  ids.logB = await insertOne('import_logs', log('2025-06-10', 'B'));
  ids.entryRetiredA = await insertOne('kpi_entries', entry(ids.logA, 'retiredA', '2025-06-02'));
  ids.entryMoved = await insertOne('kpi_entries', entry(ids.logB, 'movedRetired', '2025-06-10'));

  ids.rpRetiredA = await insertOne('roleplays', rp('ceo', 'retiredA', '2025-06-03'));
  ids.rpMoved = await insertOne('roleplays', rp('ceo', 'movedRetired', '2025-06-11'));

  const memoWith = async (row: Record<string, unknown>, target: string) => {
    const id = await insertOne('subordinate_memos', row);
    const { error } = await admin.from('subordinate_memo_targets').insert({ memo_id: id, member_id: M(target) });
    if (error) throw error;
    return id;
  };
  ids.memoRetiredA = await memoWith(memoRow('ceo', '2025-06-04', { submitted_at: new Date().toISOString() }), 'retiredA');
  ids.memoMoved = await memoWith(memoRow('ceo', '2025-06-12', { submitted_at: new Date().toISOString() }), 'movedRetired');

  for (const p of PEOPLE.filter((x) => x.login)) {
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
  if (memberIds.length) {
    const { data: memos } = await admin.from('subordinate_memos').select('id').in('created_by', memberIds);
    const memoIds = (memos ?? []).map((m) => String(m.id));
    if (memoIds.length) warnIf('subordinate_memo_targets', (await admin.from('subordinate_memo_targets').delete().in('memo_id', memoIds)).error);
    warnIf('subordinate_memo_targets（対象者の分）', (await admin.from('subordinate_memo_targets').delete().in('member_id', memberIds)).error);
    warnIf('subordinate_memos', (await admin.from('subordinate_memos').delete().in('created_by', memberIds)).error);
    warnIf('kpi_entries', (await admin.from('kpi_entries').delete().in('member_id', memberIds)).error);
    warnIf('import_logs', (await admin.from('import_logs').delete().in('imported_by', memberIds)).error);
    warnIf('roleplays', (await admin.from('roleplays').delete().in('member_id', memberIds)).error);
    warnIf('member_themes', (await admin.from('member_themes').delete().in('member_id', memberIds)).error);
    const { data: seminars } = await admin.from('seminars').select('id').in('created_by', memberIds);
    const seminarIds = (seminars ?? []).map((s) => String(s.id));
    if (seminarIds.length) warnIf('seminar_members', (await admin.from('seminar_members').delete().in('seminar_id', seminarIds)).error);
    warnIf('seminars', (await admin.from('seminars').delete().in('created_by', memberIds)).error);
    const { data: perms } = await admin.from('permissions').select('id').in('member_id', memberIds);
    for (const p of perms ?? []) auditRowIds.push(String(p.id));
    warnIf('permissions', (await admin.from('permissions').delete().in('member_id', memberIds)).error);
    const { data: assigns } = await admin.from('mgr_assignments').select('id').in('mgr_member_id', memberIds);
    for (const a of assigns ?? []) auditRowIds.push(String(a.id));
    warnIf('mgr_assignments', (await admin.from('mgr_assignments').delete().in('mgr_member_id', memberIds)).error);
    const { data: affs } = await admin.from('member_affiliations').select('id').in('member_id', memberIds);
    for (const a of affs ?? []) auditRowIds.push(String(a.id));
    warnIf('member_affiliations', (await admin.from('member_affiliations').delete().in('member_id', memberIds)).error);
  }
  warnIf('roleplay_themes', (await admin.from('roleplay_themes').delete().like('name', `${RUN}%`)).error);
  warnIf('masters', (await admin.from('masters').delete().like('name', `${RUN}%`)).error);
  if (memberIds.length) warnIf('members', (await admin.from('members').delete().in('id', memberIds)).error);
  // テストで足せてしまった名簿の行があれば、それも消す（足せないことを確かめるテストの分）
  const { data: extraMembers } = await admin.from('members').select('id').like('name', `${RUN}%`);
  for (const m of extraMembers ?? []) auditRowIds.push(String(m.id));
  warnIf('members（テストで足した分）', (await admin.from('members').delete().like('name', `${RUN}%`)).error);
  // テストで足したチームも含めて消す
  const { data: teams } = await admin.from('teams').select('id').like('name', `${RUN}%`);
  for (const t of teams ?? []) auditRowIds.push(String(t.id));
  warnIf('teams', (await admin.from('teams').delete().like('name', `${RUN}%`)).error);
  // 片づけの削除で増えた分も含めて、この回の監査ログを消す（管理用の鍵だけが消せる）
  if (auditRowIds.length) warnIf('audit_logs', (await admin.from('audit_logs').delete().in('row_id', [...new Set(auditRowIds)])).error);
  for (const p of PEOPLE) {
    if (p.authId) warnIf(`利用者 ${p.key}`, (await admin.auth.admin.deleteUser(p.authId)).error);
  }
}, 180_000);

describe('退職した人の記録：最後にいたチームの今の上席が読める（2026-11-07）', () => {
  it('名簿の行：最後のチームの今のリーダー・担当MGRは読め、ほかのチームのリーダーは読めない', async () => {
    expect(await seenIds('leaderA', 'members', [M('retiredA')])).toEqual([M('retiredA')]);
    expect(await seenIds('mgr1', 'members', [M('retiredA')])).toEqual([M('retiredA')]);
    expect(await seenIds('leaderB', 'members', [M('retiredA')])).toEqual([]);
  });

  it('異動してから退職した人は、異動の前のチームではなく、最後のチームの今の上席が読める', async () => {
    expect(await seenIds('leaderB', 'members', [M('movedRetired')])).toEqual([M('movedRetired')]);
    expect(await seenIds('leaderA', 'members', [M('movedRetired')])).toEqual([]);
    expect(await seenIds('mgr1', 'members', [M('movedRetired')])).toEqual([]);
  });

  it('承認済みの日々のKPI：同じ決まりで読める', async () => {
    const both = [ids.entryRetiredA, ids.entryMoved];
    expect(await seenIds('leaderA', 'kpi_entries', both)).toEqual([ids.entryRetiredA]);
    expect(await seenIds('mgr1', 'kpi_entries', both)).toEqual([ids.entryRetiredA]);
    expect(await seenIds('leaderB', 'kpi_entries', both)).toEqual([ids.entryMoved]);
  });

  it('ロープレの記録：同じ決まりで読める', async () => {
    const both = [ids.rpRetiredA, ids.rpMoved];
    expect(await seenIds('leaderA', 'roleplays', both)).toEqual([ids.rpRetiredA]);
    expect(await seenIds('mgr1', 'roleplays', both)).toEqual([ids.rpRetiredA]);
    expect(await seenIds('leaderB', 'roleplays', both)).toEqual([ids.rpMoved]);
  });

  it('部下メモ：書いた人でなくても、最後のチームの今の上席が読める', async () => {
    const both = [ids.memoRetiredA, ids.memoMoved];
    expect(await seenIds('leaderA', 'subordinate_memos', both)).toEqual([ids.memoRetiredA]);
    expect(await seenIds('mgr1', 'subordinate_memos', both)).toEqual([ids.memoRetiredA]);
    expect(await seenIds('leaderB', 'subordinate_memos', both)).toEqual([ids.memoMoved]);
  });
});

describe('退職した人を対象にした新しい記録は書けない（読む範囲だけを広げる）', () => {
  it('ロープレの記録を足せない', async () => {
    await C('leaderA').from('roleplays').insert(rp('leaderA', 'retiredA', '2025-06-20', { fixed_point: `${RUN}-blocked-rp` }));
    expect(await adminRows('roleplays', (q) => q.eq('fixed_point', `${RUN}-blocked-rp`))).toHaveLength(0);
  });

  it('テーマ表に足せない', async () => {
    await C('leaderA').from('member_themes').insert({
      member_id: M('retiredA'),
      theme_id: ids.theme,
      kind: 'apo',
      started_on: '2025-06-20',
      pass_line: `${RUN}-blocked-theme`,
      status: 'practicing',
      created_by: M('leaderA'),
    });
    expect(await adminRows('member_themes', (q) => q.eq('pass_line', `${RUN}-blocked-theme`))).toHaveLength(0);
  });

  it('部下メモの対象者に足せない', async () => {
    const memoId = await insertOne('subordinate_memos', memoRow('leaderA', '2025-06-20', { noticed: `${RUN}-draft` }));
    await C('leaderA').from('subordinate_memo_targets').insert({ memo_id: memoId, member_id: M('retiredA') });
    expect(await adminRows('subordinate_memo_targets', (q) => q.eq('memo_id', memoId))).toHaveLength(0);
  });

  it('研修の参加者に足せない', async () => {
    const seminarId = await insertOne('seminars', {
      date: '2025-06-20',
      theme: `${RUN}-seminar`,
      lecturer: '架空の講師',
      minutes: 60,
      content: '架空の内容',
      created_by: M('leaderA'),
    });
    await C('leaderA').from('seminar_members').insert({ seminar_id: seminarId, member_id: M('retiredA') });
    expect(await adminRows('seminar_members', (q) => q.eq('seminar_id', seminarId).eq('member_id', M('retiredA')))).toHaveLength(0);
  });
});

describe('ロープレの過去の記録の印は、ログインした人が付けられない', () => {
  it('過去の記録の印・元の行を入れて足すことはできない', async () => {
    await C('leaderA').from('roleplays').insert(rp('leaderA', 'memberA1', '2025-06-21', { fixed_point: `${RUN}-legacy-1`, is_legacy: true }));
    await C('leaderA').from('roleplays').insert(rp('leaderA', 'memberA1', '2025-06-21', { fixed_point: `${RUN}-legacy-2`, legacy_source: { note: '架空' } }));
    expect(await adminRows('roleplays', (q) => q.in('fixed_point', [`${RUN}-legacy-1`, `${RUN}-legacy-2`]))).toHaveLength(0);
  });

  it('自分の記録でも、あとから印を付けられない', async () => {
    const { error } = await C('leaderA').from('roleplays').insert(rp('leaderA', 'memberA1', '2025-06-22', { fixed_point: `${RUN}-own` }));
    expect(error).toBeNull();
    const own = (await adminRows('roleplays', (q) => q.eq('fixed_point', `${RUN}-own`)))[0];
    expect(own).toBeTruthy();
    expect(own.is_legacy).toBe(false);
    await C('leaderA').from('roleplays').update({ is_legacy: true, legacy_source: { note: '架空' } }).eq('id', own.id);
    const after = (await adminRows('roleplays', (q) => q.eq('id', own.id)))[0];
    expect(after.is_legacy).toBe(false);
    expect(after.legacy_source).toBeNull();
  });
});

describe('名簿・チーム・権限を直せるのは管理者の権限がある人（権限は代表も）', () => {
  it('管理者の権限がない人は、名簿・所属・チーム・権限を直せない', async () => {
    await C('leaderA').from('members').update({ goes_to_sales: true }).eq('id', M('memberA1'));
    expect((await adminRows('members', (q) => q.eq('id', M('memberA1'))))[0].goes_to_sales).toBe(false);

    await C('leaderA').from('member_affiliations').insert({ member_id: M('memberA1'), team_id: ids.teamB, base: `${RUN}-base`, start_date: '2025-07-01', end_date: null });
    expect(await adminRows('member_affiliations', (q) => q.eq('base', `${RUN}-base`))).toHaveLength(0);

    await C('leaderA').from('teams').insert({ name: `${RUN}-blocked-team` });
    expect(await adminRows('teams', (q) => q.eq('name', `${RUN}-blocked-team`))).toHaveLength(0);

    await C('leaderA').from('permissions').insert({ member_id: M('memberA1'), kind: 'talk_owner', granted_by: M('leaderA') });
    expect(await adminRows('permissions', (q) => q.eq('member_id', M('memberA1')))).toHaveLength(0);
  });

  it('管理者の権限がある人は、チームを足し、名簿を直し（代表の役割は除く）、権限を与えて外せる。どれも監査ログに残る', async () => {
    // ここから leaderA に管理者の権限を与える（このあとのテストは leaderA が管理者として動く）
    ids.permLeaderA = await insertOne('permissions', { member_id: M('leaderA'), kind: 'admin', granted_by: M('ceo'), granted_at: new Date().toISOString() });
    auditRowIds.push(ids.permLeaderA);

    const { error: teamErr } = await C('leaderA').from('teams').insert({ name: `${RUN}-new-team` });
    expect(teamErr).toBeNull();
    const newTeam = (await adminRows('teams', (q) => q.eq('name', `${RUN}-new-team`)))[0];
    expect(newTeam).toBeTruthy();
    auditRowIds.push(String(newTeam.id));

    const { error: memErr } = await C('leaderA').from('members').update({ goes_to_sales: true }).eq('id', M('memberA1'));
    expect(memErr).toBeNull();
    expect((await adminRows('members', (q) => q.eq('id', M('memberA1'))))[0].goes_to_sales).toBe(true);

    // 役割を「代表」にする・「代表」から外すのは代表だけ（2026-11-07 本人の選択）。管理者でもできない
    await C('leaderA').from('members').update({ role: 'ceo' }).eq('id', M('memberA1'));
    expect((await adminRows('members', (q) => q.eq('id', M('memberA1'))))[0].role).toBe('member');
    await C('leaderA').from('members').update({ role: 'leader' }).eq('id', M('ceo'));
    expect((await adminRows('members', (q) => q.eq('id', M('ceo'))))[0].role).toBe('ceo');
    await C('leaderA').from('members').insert({ email: `${RUN}-newceo@example.test`, name: `${RUN}-newceo`, role: 'ceo', goes_to_sales: false, hired_on: '2025-07-01' });
    expect(await adminRows('members', (q) => q.eq('name', `${RUN}-newceo`))).toHaveLength(0);

    const { error: grantErr } = await C('leaderA').from('permissions').insert({ member_id: M('memberA1'), kind: 'talk_owner', granted_by: M('leaderA') });
    expect(grantErr).toBeNull();
    const granted = (await adminRows('permissions', (q) => q.eq('member_id', M('memberA1')).eq('kind', 'talk_owner')))[0];
    expect(granted).toBeTruthy();
    expect(granted.revoked_at).toBeNull();
    auditRowIds.push(String(granted.id));

    // 与えた権限の種類や人は、あとから書きかえられない（外すことだけができる。最後の管理者の決まりを回り道で破らせないため）
    await C('leaderA').from('permissions').update({ kind: 'admin' }).eq('id', granted.id);
    await C('leaderA').from('permissions').update({ member_id: M('leaderB') }).eq('id', granted.id);
    const unchanged = (await adminRows('permissions', (q) => q.eq('id', granted.id)))[0];
    expect(unchanged.kind).toBe('talk_owner');
    expect(unchanged.member_id).toBe(M('memberA1'));

    const { error: revokeErr } = await C('leaderA')
      .from('permissions')
      .update({ revoked_at: new Date().toISOString(), revoked_by: M('leaderA') })
      .eq('id', granted.id);
    expect(revokeErr).toBeNull();
    expect((await adminRows('permissions', (q) => q.eq('id', granted.id)))[0].revoked_at).not.toBeNull();

    // 監査ログ：チームを足した・名簿を直した・権限を与えた・外した
    expect(await adminRows('audit_logs', (q) => q.eq('table_name', 'teams').eq('row_id', String(newTeam.id)))).not.toHaveLength(0);
    expect(await adminRows('audit_logs', (q) => q.eq('table_name', 'members').eq('row_id', M('memberA1')).eq('action', 'update'))).not.toHaveLength(0);
    expect(await adminRows('audit_logs', (q) => q.eq('table_name', 'permissions').eq('row_id', String(granted.id)))).toHaveLength(2);
  });

  it('管理者の権限があっても、退職した人の指導の記録を読める範囲は広がらない', async () => {
    // leaderA は今は管理者。異動して退職した人（最後のチーム＝B）の部下メモとロープレは読めないまま
    expect(await seenIds('leaderA', 'subordinate_memos', [ids.memoMoved])).toEqual([]);
    expect(await seenIds('leaderA', 'roleplays', [ids.rpMoved])).toEqual([]);
  });
});
