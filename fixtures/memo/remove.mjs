import { createClient } from '@supabase/supabase-js';
import { FIXTURE_MEMBERS, TEST_CEO_NAME } from '../foundation/data.mjs';
import { FIXTURE_MEMO_MASTERS } from './data.mjs';

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

  const auditRowIds = [];

  if (memberIds.length > 0) {
    const memoIdSet = new Set();

    const { data: memosByWriter, error: mSel1Err } = await admin
      .from('subordinate_memos')
      .select('id')
      .in('created_by', memberIds);
    checkError('subordinate_memos（created_by 検索）', mSel1Err);
    for (const r of memosByWriter ?? []) memoIdSet.add(r.id);

    const { data: targetsByMember, error: tSelErr } = await admin
      .from('subordinate_memo_targets')
      .select('memo_id')
      .in('member_id', memberIds);
    checkError('subordinate_memo_targets（member_id 検索）', tSelErr);
    for (const r of targetsByMember ?? []) memoIdSet.add(r.memo_id);

    const memoIds = Array.from(memoIdSet);

    if (memoIds.length > 0) {
      const { error: tDel1Err } = await admin
        .from('subordinate_memo_targets')
        .delete()
        .in('memo_id', memoIds);
      checkError('subordinate_memo_targets（memo_id）', tDel1Err);
    }

    const { error: tDel2Err } = await admin
      .from('subordinate_memo_targets')
      .delete()
      .in('member_id', memberIds);
    checkError('subordinate_memo_targets（member_id）', tDel2Err);

    if (memoIds.length > 0) {
      const { error: mDel1Err } = await admin
        .from('subordinate_memos')
        .delete()
        .in('id', memoIds);
      checkError('subordinate_memos（id）', mDel1Err);
    }

    const { error: mDel2Err } = await admin
      .from('subordinate_memos')
      .delete()
      .in('created_by', memberIds);
    checkError('subordinate_memos（created_by）', mDel2Err);
  }

  // 一覧（masters）の部下メモのテーマ7つ・種類4つと監査ログの片づけ
  const masterNames = FIXTURE_MEMO_MASTERS.map((m) => m.name);
  const { data: masterRows, error: masSelErr } = await admin
    .from('masters')
    .select('id')
    .in('kind', ['memo_theme', 'memo_kind'])
    .in('name', masterNames);
  checkError('masters（memo_theme / memo_kind 検索）', masSelErr);

  for (const m of masterRows ?? []) {
    auditRowIds.push(String(m.id));
  }

  if ((masterRows ?? []).length > 0) {
    const { error: masDelErr } = await admin
      .from('masters')
      .delete()
      .in(
        'id',
        (masterRows ?? []).map((m) => m.id),
      );
    checkError('masters（memo_theme / memo_kind）', masDelErr);
  }

  if (auditRowIds.length > 0) {
    const { error: audDelErr } = await admin
      .from('audit_logs')
      .delete()
      .in('row_id', Array.from(new Set(auditRowIds)));
    checkError('audit_logs', audDelErr);
  }

  console.log('部下メモの架空データをすべて削除しました。');
}

main().catch((err) => {
  console.error('消せなかった:', err?.message ?? err);
  process.exit(1);
});
