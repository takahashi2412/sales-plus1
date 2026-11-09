import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!url || !serviceKey) {
  console.error('必要な環境変数（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）が設定されていません。');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function checkError(label, error) {
  if (error) {
    throw new Error(`${label} を消せなかった: ${error.message}`);
  }
}

async function main() {
  const { data: guardMembers, error: memSelErr } = await admin
    .from('members')
    .select('id, auth_user_id')
    .like('name', 'guardkt%');
  checkError('members（guardkt検索）', memSelErr);
  const memberIds = (guardMembers ?? []).map((m) => m.id);
  const authUserIdsFromMembers = (guardMembers ?? [])
    .map((m) => m.auth_user_id)
    .filter(Boolean);

  const { data: guardTeams, error: teamSelErr } = await admin
    .from('teams')
    .select('id')
    .like('name', 'guardkt%');
  checkError('teams（guardkt検索）', teamSelErr);
  const teamIds = (guardTeams ?? []).map((t) => t.id);

  const auditRowIds = [...memberIds.map(String), ...teamIds.map(String)];

  // 取り込みの記録の特定
  const importLogIdSet = new Set();
  if (memberIds.length > 0) {
    const { data: logsByImp, error: l1Err } = await admin
      .from('import_logs')
      .select('id')
      .in('imported_by', memberIds);
    checkError('import_logs（imported_by）', l1Err);
    for (const r of logsByImp ?? []) importLogIdSet.add(r.id);

    const { data: logsByApp, error: l2Err } = await admin
      .from('import_logs')
      .select('id')
      .in('approved_by', memberIds);
    checkError('import_logs（approved_by）', l2Err);
    for (const r of logsByApp ?? []) importLogIdSet.add(r.id);
  }
  if (teamIds.length > 0) {
    const { data: logsByTeam, error: l3Err } = await admin
      .from('import_logs')
      .select('id')
      .in('team_id', teamIds);
    checkError('import_logs（team_id）', l3Err);
    for (const r of logsByTeam ?? []) importLogIdSet.add(r.id);
  }
  const { data: logsByCsv, error: l4Err } = await admin
    .from('import_logs')
    .select('id')
    .like('csv_team_name', 'guardkt%');
  checkError('import_logs（csv_team_name）', l4Err);
  for (const r of logsByCsv ?? []) importLogIdSet.add(r.id);

  const importLogIds = Array.from(importLogIdSet);

  if (memberIds.length > 0) {
    // 部下メモ
    const { data: memos, error: memoSelErr } = await admin
      .from('subordinate_memos')
      .select('id')
      .in('created_by', memberIds);
    checkError('subordinate_memos（検索）', memoSelErr);
    const memoIds = (memos ?? []).map((m) => String(m.id));
    if (memoIds.length > 0) {
      checkError(
        'subordinate_memo_targets（memo_id）',
        (await admin.from('subordinate_memo_targets').delete().in('memo_id', memoIds)).error,
      );
    }
    checkError(
      'subordinate_memo_targets（member_id）',
      (await admin.from('subordinate_memo_targets').delete().in('member_id', memberIds)).error,
    );
    checkError(
      'subordinate_memos',
      (await admin.from('subordinate_memos').delete().in('created_by', memberIds)).error,
    );

    // KPI
    checkError(
      'alerts（member_id）',
      (await admin.from('alerts').delete().in('member_id', memberIds)).error,
    );
    checkError(
      'alerts（responded_by）',
      (await admin.from('alerts').delete().in('responded_by', memberIds)).error,
    );
    checkError(
      'kpi_entries（member_id）',
      (await admin.from('kpi_entries').delete().in('member_id', memberIds)).error,
    );
    checkError(
      'kpi_targets（member_id）',
      (await admin.from('kpi_targets').delete().in('member_id', memberIds)).error,
    );

    // ロープレ・テーマ表・研修
    checkError(
      'roleplays（member_id）',
      (await admin.from('roleplays').delete().in('member_id', memberIds)).error,
    );
    checkError(
      'roleplays（runner_member_id）',
      (await admin.from('roleplays').delete().in('runner_member_id', memberIds)).error,
    );
    checkError(
      'member_themes（member_id）',
      (await admin.from('member_themes').delete().in('member_id', memberIds)).error,
    );
    checkError(
      'member_themes（created_by）',
      (await admin.from('member_themes').delete().in('created_by', memberIds)).error,
    );

    const { data: seminars, error: semSelErr } = await admin
      .from('seminars')
      .select('id')
      .in('created_by', memberIds);
    checkError('seminars（検索）', semSelErr);
    const seminarIds = (seminars ?? []).map((s) => String(s.id));
    if (seminarIds.length > 0) {
      checkError(
        'seminar_members（seminar_id）',
        (await admin.from('seminar_members').delete().in('seminar_id', seminarIds)).error,
      );
    }
    checkError(
      'seminar_members（member_id）',
      (await admin.from('seminar_members').delete().in('member_id', memberIds)).error,
    );
    checkError(
      'seminars',
      (await admin.from('seminars').delete().in('created_by', memberIds)).error,
    );

    // 権限・担当・所属
    const { data: perms, error: permSelErr } = await admin
      .from('permissions')
      .select('id')
      .in('member_id', memberIds);
    checkError('permissions（検索）', permSelErr);
    for (const p of perms ?? []) auditRowIds.push(String(p.id));
    checkError(
      'permissions',
      (await admin.from('permissions').delete().in('member_id', memberIds)).error,
    );

    const { data: assigns, error: asgSelErr } = await admin
      .from('mgr_assignments')
      .select('id')
      .in('mgr_member_id', memberIds);
    checkError('mgr_assignments（検索）', asgSelErr);
    for (const a of assigns ?? []) auditRowIds.push(String(a.id));
    checkError(
      'mgr_assignments',
      (await admin.from('mgr_assignments').delete().in('mgr_member_id', memberIds)).error,
    );

    const { data: affs, error: affSelErr } = await admin
      .from('member_affiliations')
      .select('id')
      .in('member_id', memberIds);
    checkError('member_affiliations（検索）', affSelErr);
    for (const a of affs ?? []) auditRowIds.push(String(a.id));
    checkError(
      'member_affiliations',
      (await admin.from('member_affiliations').delete().in('member_id', memberIds)).error,
    );
  }

  if (importLogIds.length > 0) {
    checkError(
      'alerts（import_log_id）',
      (await admin.from('alerts').delete().in('import_log_id', importLogIds)).error,
    );
    checkError(
      'kpi_entries（import_log_id）',
      (await admin.from('kpi_entries').delete().in('import_log_id', importLogIds)).error,
    );
    checkError(
      'import_logs（id）',
      (await admin.from('import_logs').delete().in('id', importLogIds)).error,
    );
  }

  // テーマ・一覧・名簿・チーム
  checkError(
    'roleplay_themes',
    (await admin.from('roleplay_themes').delete().like('name', 'guardkt%')).error,
  );

  const { data: guardMasters, error: masSelErr } = await admin
    .from('masters')
    .select('id')
    .like('name', 'guardkt%');
  checkError('masters（guardkt検索）', masSelErr);
  for (const m of guardMasters ?? []) auditRowIds.push(String(m.id));
  checkError(
    'masters',
    (await admin.from('masters').delete().like('name', 'guardkt%')).error,
  );

  if (memberIds.length > 0) {
    checkError('members', (await admin.from('members').delete().in('id', memberIds)).error);
  }
  if (teamIds.length > 0) {
    checkError('teams', (await admin.from('teams').delete().in('id', teamIds)).error);
  }

  // 監査ログ
  if (auditRowIds.length > 0) {
    checkError(
      'audit_logs',
      (await admin.from('audit_logs').delete().in('row_id', Array.from(new Set(auditRowIds)))).error,
    );
  }

  // Auth ユーザーの片づけ
  const { data: usersList, error: usersErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  checkError('auth.users（一覧）', usersErr);
  const guardUsers = (usersList?.users ?? []).filter(
    (u) =>
      authUserIdsFromMembers.includes(u.id) ||
      (typeof u.email === 'string' &&
        u.email.toLowerCase().startsWith('guardkt') &&
        u.email.toLowerCase().endsWith('@example.test')),
  );
  for (const u of guardUsers) {
    const { error: delUserErr } = await admin.auth.admin.deleteUser(u.id);
    checkError(`auth.users（${u.email}）`, delUserErr);
  }

  console.log(
    `カルテの守りのテスト（guardkt）の残りデータを片づけました（対象名簿: ${memberIds.length}件）。`,
  );
}

main().catch((err) => {
  console.error('消せなかった:', err?.message ?? err);
  process.exit(1);
});
