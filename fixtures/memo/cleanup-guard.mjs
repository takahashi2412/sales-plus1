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

  const auditRowIds = [];
  const memoIdSet = new Set();

  if (memberIds.length > 0) {
    const { data: memosByWriter, error: mSelErr } = await admin
      .from('subordinate_memos')
      .select('id')
      .in('created_by', memberIds);
    checkError('subordinate_memos（created_by guard検索）', mSelErr);
    for (const r of memosByWriter ?? []) memoIdSet.add(r.id);

    const { data: targetsByMem, error: tSelErr } = await admin
      .from('subordinate_memo_targets')
      .select('memo_id')
      .in('member_id', memberIds);
    checkError('subordinate_memo_targets（member_id guard検索）', tSelErr);
    for (const r of targetsByMem ?? []) memoIdSet.add(r.memo_id);
  }

  const { data: memosByNoticed, error: mNotSelErr } = await admin
    .from('subordinate_memos')
    .select('id')
    .like('noticed', 'guard%');
  checkError('subordinate_memos（noticed guard検索）', mNotSelErr);
  for (const r of memosByNoticed ?? []) memoIdSet.add(r.id);

  const memoIds = Array.from(memoIdSet);

  if (memoIds.length > 0) {
    const { error: tDel1Err } = await admin
      .from('subordinate_memo_targets')
      .delete()
      .in('memo_id', memoIds);
    checkError('subordinate_memo_targets（memo_id）', tDel1Err);
  }

  if (memberIds.length > 0) {
    const { error: tDel2Err } = await admin
      .from('subordinate_memo_targets')
      .delete()
      .in('member_id', memberIds);
    checkError('subordinate_memo_targets（member_id）', tDel2Err);

    const { error: mDel2Err } = await admin
      .from('subordinate_memos')
      .delete()
      .in('created_by', memberIds);
    checkError('subordinate_memos（created_by）', mDel2Err);
  }

  if (memoIds.length > 0) {
    const { error: mDel1Err } = await admin
      .from('subordinate_memos')
      .delete()
      .in('id', memoIds);
    checkError('subordinate_memos（id）', mDel1Err);
  }

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

  console.log(`部下メモの守りのテストの残りデータを片づけました（対象名簿: ${memberIds.length}件）。`);
}

main().catch((err) => {
  console.error('消せなかった:', err?.message ?? err);
  process.exit(1);
});
