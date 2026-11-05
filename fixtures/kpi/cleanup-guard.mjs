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
    .select('id')
    .like('name', 'guard%');
  checkError('members（guard検索）', memSelErr);
  const memberIds = (guardMembers ?? []).map((m) => m.id);

  const { data: guardTeams, error: teamSelErr } = await admin
    .from('teams')
    .select('id')
    .like('name', 'guard%');
  checkError('teams（guard検索）', teamSelErr);
  const teamIds = (guardTeams ?? []).map((t) => t.id);

  const auditRowIds = [];
  const importLogIdSet = new Set();

  if (memberIds.length > 0) {
    const { data: logsByImp, error: l1Err } = await admin
      .from('import_logs')
      .select('id')
      .in('imported_by', memberIds);
    checkError('import_logs（imported_by guard検索）', l1Err);
    for (const r of logsByImp ?? []) importLogIdSet.add(r.id);

    const { data: logsByApp, error: l2Err } = await admin
      .from('import_logs')
      .select('id')
      .in('approved_by', memberIds);
    checkError('import_logs（approved_by guard検索）', l2Err);
    for (const r of logsByApp ?? []) importLogIdSet.add(r.id);
  }

  if (teamIds.length > 0) {
    const { data: logsByTeam, error: l3Err } = await admin
      .from('import_logs')
      .select('id')
      .in('team_id', teamIds);
    checkError('import_logs（team_id guard検索）', l3Err);
    for (const r of logsByTeam ?? []) importLogIdSet.add(r.id);
  }

  const { data: logsByCsv, error: l4Err } = await admin
    .from('import_logs')
    .select('id')
    .like('csv_team_name', 'guard%');
  checkError('import_logs（csv_team_name guard検索）', l4Err);
  for (const r of logsByCsv ?? []) importLogIdSet.add(r.id);

  const importLogIds = Array.from(importLogIdSet);

  // アラート → 日々のKPI → 取り込みの記録、月の目標、名前の対応
  if (memberIds.length > 0) {
    const { error: alMemErr } = await admin.from('alerts').delete().in('member_id', memberIds);
    checkError('alerts（member_id）', alMemErr);

    const { error: alResErr } = await admin.from('alerts').delete().in('responded_by', memberIds);
    checkError('alerts（responded_by）', alResErr);

    const { error: keMemErr } = await admin.from('kpi_entries').delete().in('member_id', memberIds);
    checkError('kpi_entries（member_id）', keMemErr);

    const { error: ktMemErr } = await admin.from('kpi_targets').delete().in('member_id', memberIds);
    checkError('kpi_targets（member_id）', ktMemErr);

    const { data: mmByMem, error: mmSel1Err } = await admin
      .from('cti_member_map')
      .select('id')
      .in('member_id', memberIds);
    checkError('cti_member_map（member_id guard検索）', mmSel1Err);
    for (const r of mmByMem ?? []) auditRowIds.push(String(r.id));

    const { data: mmByCre, error: mmSel2Err } = await admin
      .from('cti_member_map')
      .select('id')
      .in('created_by', memberIds);
    checkError('cti_member_map（created_by guard検索）', mmSel2Err);
    for (const r of mmByCre ?? []) auditRowIds.push(String(r.id));

    const { error: mmDel1Err } = await admin
      .from('cti_member_map')
      .delete()
      .in('member_id', memberIds);
    checkError('cti_member_map（member_id）', mmDel1Err);

    const { error: mmDel2Err } = await admin
      .from('cti_member_map')
      .delete()
      .in('created_by', memberIds);
    checkError('cti_member_map（created_by）', mmDel2Err);

    const { data: tmByCre, error: tmSelCreErr } = await admin
      .from('cti_team_map')
      .select('id')
      .in('created_by', memberIds);
    checkError('cti_team_map（created_by guard検索）', tmSelCreErr);
    for (const r of tmByCre ?? []) auditRowIds.push(String(r.id));

    const { error: tmDelCreErr } = await admin
      .from('cti_team_map')
      .delete()
      .in('created_by', memberIds);
    checkError('cti_team_map（created_by）', tmDelCreErr);
  }

  if (importLogIds.length > 0) {
    const { error: alLogErr } = await admin
      .from('alerts')
      .delete()
      .in('import_log_id', importLogIds);
    checkError('alerts（import_log_id）', alLogErr);

    const { error: keLogErr } = await admin
      .from('kpi_entries')
      .delete()
      .in('import_log_id', importLogIds);
    checkError('kpi_entries（import_log_id）', keLogErr);

    const { error: ilDelErr } = await admin.from('import_logs').delete().in('id', importLogIds);
    checkError('import_logs（id）', ilDelErr);
  }

  // 名前が guard で始まる名前の対応・CSVのチーム名の対応・一覧・設定値を消す
  const { data: mmByName, error: mmNameSelErr } = await admin
    .from('cti_member_map')
    .select('id')
    .like('cti_name', 'guard%');
  checkError('cti_member_map（cti_name guard検索）', mmNameSelErr);
  for (const r of mmByName ?? []) auditRowIds.push(String(r.id));

  const { error: mmNameDelErr } = await admin
    .from('cti_member_map')
    .delete()
    .like('cti_name', 'guard%');
  checkError('cti_member_map（cti_name）', mmNameDelErr);

  if (teamIds.length > 0) {
    const { data: tmByTeam, error: tmTeamSelErr } = await admin
      .from('cti_team_map')
      .select('id')
      .in('team_id', teamIds);
    checkError('cti_team_map（team_id guard検索）', tmTeamSelErr);
    for (const r of tmByTeam ?? []) auditRowIds.push(String(r.id));

    const { error: tmTeamDelErr } = await admin
      .from('cti_team_map')
      .delete()
      .in('team_id', teamIds);
    checkError('cti_team_map（team_id）', tmTeamDelErr);
  }

  const { data: tmByName, error: tmNameSelErr } = await admin
    .from('cti_team_map')
    .select('id')
    .like('csv_team_name', 'guard%');
  checkError('cti_team_map（csv_team_name guard検索）', tmNameSelErr);
  for (const r of tmByName ?? []) auditRowIds.push(String(r.id));

  const { error: tmNameDelErr } = await admin
    .from('cti_team_map')
    .delete()
    .like('csv_team_name', 'guard%');
  checkError('cti_team_map（csv_team_name）', tmNameDelErr);

  const { data: guardMasters, error: masSelErr } = await admin
    .from('masters')
    .select('id')
    .like('name', 'guard%');
  checkError('masters（guard検索）', masSelErr);
  for (const m of guardMasters ?? []) auditRowIds.push(String(m.id));

  const { error: masDelErr } = await admin.from('masters').delete().like('name', 'guard%');
  checkError('masters', masDelErr);

  const { data: guardSettings, error: setSelErr } = await admin
    .from('settings')
    .select('key')
    .like('key', 'guard%');
  checkError('settings（guard検索）', setSelErr);
  for (const s of guardSettings ?? []) auditRowIds.push(String(s.key));

  const { error: setDelErr } = await admin.from('settings').delete().like('key', 'guard%');
  checkError('settings', setDelErr);

  if (auditRowIds.length > 0) {
    const { error: audDelErr } = await admin
      .from('audit_logs')
      .delete()
      .in('row_id', Array.from(new Set(auditRowIds)));
    checkError('audit_logs', audDelErr);
  }

  console.log(`KPIの守りのテストの残りデータを片づけました（対象名簿: ${memberIds.length}件）。`);
}

main().catch((err) => {
  console.error('消せなかった:', err?.message ?? err);
  process.exit(1);
});
