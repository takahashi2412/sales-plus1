import { createClient } from '@supabase/supabase-js';
import { FIXTURE_MEMBERS } from '../foundation/data.mjs';
import {
  FIXTURE_KARTE_SETTINGS,
  FIXTURE_LEGACY_MEMOS,
  FIXTURE_LEGACY_ROLEPLAYS,
  FIXTURE_RETIRED_MEMBER,
  FIXTURE_RETIRED_MEMOS,
  FIXTURE_RETIRED_ROLEPLAYS,
  KARTE_KPI_DATES,
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
  const auditRowIds = [...FIXTURE_KARTE_SETTINGS.map((s) => s.key)];

  // 1. 土台のメンバーIDと架空退職メンバーIDを取得
  const fixtureEmails = FIXTURE_MEMBERS.map((m) => m.email);
  const { data: foundationRows, error: fMemErr } = await admin
    .from('members')
    .select('id, email')
    .in('email', fixtureEmails);
  checkError('members（土台検索）', fMemErr);
  const foundationMemberIds = (foundationRows ?? []).map((r) => r.id);

  const { data: retiredRows, error: rMemErr } = await admin
    .from('members')
    .select('id')
    .ilike('email', FIXTURE_RETIRED_MEMBER.email);
  checkError('members（架空退職メンバー検索）', rMemErr);
  const retiredMemberIds = (retiredRows ?? []).map((r) => r.id);
  for (const id of retiredMemberIds) {
    auditRowIds.push(String(id));
  }

  // 2. カルテ用の取り込みの記録（import_logs）と日々のKPI（kpi_entries）・アラート（alerts）を削除
  const { data: karteLogsByFile, error: l1Err } = await admin
    .from('import_logs')
    .select('id')
    .like('file_name', '%_karte.csv');
  checkError('import_logs（file_name検索）', l1Err);

  const { data: karteLogsByDate, error: l2Err } = await admin
    .from('import_logs')
    .select('id')
    .eq('csv_team_name', '架空チームA(WEB)')
    .in('target_date', KARTE_KPI_DATES);
  checkError('import_logs（target_date検索）', l2Err);

  const logIds = Array.from(
    new Set([
      ...(karteLogsByFile ?? []).map((r) => r.id),
      ...(karteLogsByDate ?? []).map((r) => r.id),
    ]),
  );

  if (logIds.length > 0) {
    const { error: alDelErr } = await admin.from('alerts').delete().in('import_log_id', logIds);
    checkError('alerts（import_log_id）', alDelErr);

    const { error: keDelErr } = await admin
      .from('kpi_entries')
      .delete()
      .in('import_log_id', logIds);
    checkError('kpi_entries（import_log_id）', keDelErr);

    const { error: ilDelErr } = await admin.from('import_logs').delete().in('id', logIds);
    checkError('import_logs', ilDelErr);
  }

  // 3. 月の目標：2026年9月と10月の分だけを消す（11月は fixtures/kpi の目標なので残す）
  const targetMemberIds = [...foundationMemberIds, ...retiredMemberIds];
  if (targetMemberIds.length > 0) {
    const { error: ktDelErr } = await admin
      .from('kpi_targets')
      .delete()
      .in('member_id', targetMemberIds)
      .in('month', ['2026-09-01', '2026-10-01']);
    checkError('kpi_targets（9月・10月）', ktDelErr);
  }

  // 4. 過去の形のロープレ記録と、架空退職メンバーのロープレ記録を削除
  const karteFixedPoints = [
    ...FIXTURE_RETIRED_ROLEPLAYS.map((r) => r.fixed_point),
    ...FIXTURE_LEGACY_ROLEPLAYS.map((r) => r.fixed_point),
  ];
  if (karteFixedPoints.length > 0) {
    const { error: rpDel1Err } = await admin
      .from('roleplays')
      .delete()
      .in('fixed_point', karteFixedPoints);
    checkError('roleplays（fixed_point）', rpDel1Err);
  }
  if (retiredMemberIds.length > 0) {
    const { error: rpDel2Err } = await admin
      .from('roleplays')
      .delete()
      .in('member_id', retiredMemberIds);
    checkError('roleplays（retired member_id）', rpDel2Err);
  }

  // 5. 過去の形の部下メモと、架空退職メンバーの部下メモを削除
  const karteNoticedList = [
    ...FIXTURE_RETIRED_MEMOS.map((m) => m.noticed),
    ...FIXTURE_LEGACY_MEMOS.map((m) => m.noticed),
  ];
  const memoIdSet = new Set();

  if (karteNoticedList.length > 0) {
    const { data: memosByNoticed, error: mSel1Err } = await admin
      .from('subordinate_memos')
      .select('id')
      .in('noticed', karteNoticedList);
    checkError('subordinate_memos（noticed検索）', mSel1Err);
    for (const r of memosByNoticed ?? []) memoIdSet.add(r.id);
  }

  if (retiredMemberIds.length > 0) {
    const { data: targetsByRet, error: tSelErr } = await admin
      .from('subordinate_memo_targets')
      .select('memo_id')
      .in('member_id', retiredMemberIds);
    checkError('subordinate_memo_targets（retired検索）', tSelErr);
    for (const r of targetsByRet ?? []) memoIdSet.add(r.memo_id);
  }

  const memoIds = Array.from(memoIdSet);
  if (memoIds.length > 0) {
    const { error: smtDelErr } = await admin
      .from('subordinate_memo_targets')
      .delete()
      .in('memo_id', memoIds);
    checkError('subordinate_memo_targets（memo_id）', smtDelErr);

    const { error: smDelErr } = await admin
      .from('subordinate_memos')
      .delete()
      .in('id', memoIds);
    checkError('subordinate_memos（id）', smDelErr);
  }

  // 6. 架空退職メンバーの所属と名簿の行を削除
  if (retiredMemberIds.length > 0) {
    const { data: retAffs, error: affSelErr } = await admin
      .from('member_affiliations')
      .select('id')
      .in('member_id', retiredMemberIds);
    checkError('member_affiliations（retired検索）', affSelErr);
    for (const a of retAffs ?? []) {
      auditRowIds.push(String(a.id));
    }

    const { error: affDelErr } = await admin
      .from('member_affiliations')
      .delete()
      .in('member_id', retiredMemberIds);
    checkError('member_affiliations（retired）', affDelErr);

    const { error: memDelErr } = await admin
      .from('members')
      .delete()
      .in('id', retiredMemberIds);
    checkError('members（retired）', memDelErr);
  }

  // 7. 設定値（karte_call_hour_threshold・kpi_workdays）と監査ログの削除
  const settingKeys = FIXTURE_KARTE_SETTINGS.map((s) => s.key);
  const { error: setDelErr } = await admin.from('settings').delete().in('key', settingKeys);
  checkError('settings（karte）', setDelErr);

  if (auditRowIds.length > 0) {
    const { error: audDelErr } = await admin
      .from('audit_logs')
      .delete()
      .in('row_id', Array.from(new Set(auditRowIds)));
    checkError('audit_logs', audDelErr);
  }

  console.log('カルテの架空データをすべて削除しました。');
}

main().catch((err) => {
  console.error('消せなかった:', err?.message ?? err);
  process.exit(1);
});
