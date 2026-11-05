import { createClient } from '@supabase/supabase-js';
import { FIXTURE_MEMBERS, FIXTURE_TEAMS, TEST_CEO_NAME } from '../foundation/data.mjs';
import {
  FIXTURE_CTI_MEMBER_MAP,
  FIXTURE_CTI_TEAM_MAP,
  FIXTURE_KPI_SETTINGS,
} from './data.mjs';

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
  const fixtureEmails = FIXTURE_MEMBERS.map((m) => m.email);
  const { data: byEmail, error: emailErr } = await admin
    .from('members')
    .select('id')
    .in('email', fixtureEmails);
  checkError('members（メール検索）', emailErr);

  const { data: byCeoName, error: ceoErr } = await admin
    .from('members')
    .select('id')
    .eq('name', TEST_CEO_NAME);
  checkError('members（代表検索）', ceoErr);

  const memberIds = Array.from(
    new Set([...(byEmail ?? []).map((r) => r.id), ...(byCeoName ?? []).map((r) => r.id)]),
  );

  const teamNames = FIXTURE_TEAMS.map((t) => t.name);
  const { data: teamRows, error: teamSelErr } = await admin
    .from('teams')
    .select('id')
    .in('name', teamNames);
  checkError('teams（検索）', teamSelErr);
  const teamIds = (teamRows ?? []).map((t) => t.id);

  const auditRowIds = [...FIXTURE_KPI_SETTINGS.map((s) => s.key)];

  // 1. 取り込みの記録の特定
  const importLogIdSet = new Set();

  if (memberIds.length > 0) {
    const { data: logsByImporter, error: l1Err } = await admin
      .from('import_logs')
      .select('id')
      .in('imported_by', memberIds);
    checkError('import_logs（imported_by 検索）', l1Err);
    for (const r of logsByImporter ?? []) importLogIdSet.add(r.id);

    const { data: logsByApprover, error: l2Err } = await admin
      .from('import_logs')
      .select('id')
      .in('approved_by', memberIds);
    checkError('import_logs（approved_by 検索）', l2Err);
    for (const r of logsByApprover ?? []) importLogIdSet.add(r.id);
  }

  if (teamIds.length > 0) {
    const { data: logsByTeam, error: l3Err } = await admin
      .from('import_logs')
      .select('id')
      .in('team_id', teamIds);
    checkError('import_logs（team_id 検索）', l3Err);
    for (const r of logsByTeam ?? []) importLogIdSet.add(r.id);
  }

  const csvTeamNames = FIXTURE_CTI_TEAM_MAP.map((t) => t.csv_team_name);
  if (csvTeamNames.length > 0) {
    const { data: logsByCsvTeam, error: l4Err } = await admin
      .from('import_logs')
      .select('id')
      .in('csv_team_name', csvTeamNames);
    checkError('import_logs（csv_team_name 検索）', l4Err);
    for (const r of logsByCsvTeam ?? []) importLogIdSet.add(r.id);
  }

  const importLogIds = Array.from(importLogIdSet);

  // 2. アラート → 日々のKPI → 取り込みの記録
  if (memberIds.length > 0) {
    const { error: alMemErr } = await admin.from('alerts').delete().in('member_id', memberIds);
    checkError('alerts（member_id）', alMemErr);

    const { error: alResErr } = await admin.from('alerts').delete().in('responded_by', memberIds);
    checkError('alerts（responded_by）', alResErr);

    const { error: keMemErr } = await admin.from('kpi_entries').delete().in('member_id', memberIds);
    checkError('kpi_entries（member_id）', keMemErr);
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

  // 3. 月の目標
  if (memberIds.length > 0) {
    const { error: ktErr } = await admin.from('kpi_targets').delete().in('member_id', memberIds);
    checkError('kpi_targets（member_id）', ktErr);
  }

  // 4. 名前の対応・CSVのチーム名の対応
  const ctiNames = FIXTURE_CTI_MEMBER_MAP.map((m) => m.cti_name);
  if (memberIds.length > 0) {
    const { data: mmByMem, error: mmSel1Err } = await admin
      .from('cti_member_map')
      .select('id')
      .in('member_id', memberIds);
    checkError('cti_member_map（member_id 検索）', mmSel1Err);
    for (const r of mmByMem ?? []) auditRowIds.push(String(r.id));

    const { data: mmByCre, error: mmSel2Err } = await admin
      .from('cti_member_map')
      .select('id')
      .in('created_by', memberIds);
    checkError('cti_member_map（created_by 検索）', mmSel2Err);
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
  }

  if (ctiNames.length > 0) {
    const { data: mmByName, error: mmSel3Err } = await admin
      .from('cti_member_map')
      .select('id')
      .in('cti_name', ctiNames);
    checkError('cti_member_map（cti_name 検索）', mmSel3Err);
    for (const r of mmByName ?? []) auditRowIds.push(String(r.id));

    const { error: mmDel3Err } = await admin
      .from('cti_member_map')
      .delete()
      .in('cti_name', ctiNames);
    checkError('cti_member_map（cti_name）', mmDel3Err);
  }

  if (teamIds.length > 0) {
    const { data: tmByTeam, error: tmSel1Err } = await admin
      .from('cti_team_map')
      .select('id')
      .in('team_id', teamIds);
    checkError('cti_team_map（team_id 検索）', tmSel1Err);
    for (const r of tmByTeam ?? []) auditRowIds.push(String(r.id));

    const { error: tmDel1Err } = await admin
      .from('cti_team_map')
      .delete()
      .in('team_id', teamIds);
    checkError('cti_team_map（team_id）', tmDel1Err);
  }

  if (memberIds.length > 0) {
    const { data: tmByCre, error: tmSel2Err } = await admin
      .from('cti_team_map')
      .select('id')
      .in('created_by', memberIds);
    checkError('cti_team_map（created_by 検索）', tmSel2Err);
    for (const r of tmByCre ?? []) auditRowIds.push(String(r.id));

    const { error: tmDel2Err } = await admin
      .from('cti_team_map')
      .delete()
      .in('created_by', memberIds);
    checkError('cti_team_map（created_by）', tmDel2Err);
  }

  if (csvTeamNames.length > 0) {
    const { data: tmByName, error: tmSel3Err } = await admin
      .from('cti_team_map')
      .select('id')
      .in('csv_team_name', csvTeamNames);
    checkError('cti_team_map（csv_team_name 検索）', tmSel3Err);
    for (const r of tmByName ?? []) auditRowIds.push(String(r.id));

    const { error: tmDel3Err } = await admin
      .from('cti_team_map')
      .delete()
      .in('csv_team_name', csvTeamNames);
    checkError('cti_team_map（csv_team_name）', tmDel3Err);
  }

  // 5. 設定値（kpi_holidays）と監査ログの片づけ
  const settingKeys = FIXTURE_KPI_SETTINGS.map((s) => s.key);
  const { error: setDelErr } = await admin.from('settings').delete().in('key', settingKeys);
  checkError('settings（kpi_holidays）', setDelErr);

  if (auditRowIds.length > 0) {
    const { error: audDelErr } = await admin
      .from('audit_logs')
      .delete()
      .in('row_id', Array.from(new Set(auditRowIds)));
    checkError('audit_logs', audDelErr);
  }

  console.log('KPIの架空データをすべて削除しました。');
}

main().catch((err) => {
  console.error('消せなかった:', err?.message ?? err);
  process.exit(1);
});
