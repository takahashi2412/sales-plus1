import { createClient } from '@supabase/supabase-js';
import { FIXTURE_MEMBERS, TEST_CEO_NAME } from '../foundation/data.mjs';
import { FIXTURE_MEMO_MASTERS, FIXTURE_SUBORDINATE_MEMOS } from './data.mjs';

const url = process.env.SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!url || !serviceKey) {
  console.error('必要な環境変数（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）が設定されていません。');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function ensureMaster(item) {
  const { data: existing, error: selErr } = await admin
    .from('masters')
    .select('id')
    .eq('kind', item.kind)
    .eq('name', item.name)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) {
    const { error: updErr } = await admin
      .from('masters')
      .update({ sort_order: item.sort_order, is_active: true })
      .eq('id', existing.id);
    if (updErr) throw updErr;
    return existing.id;
  }

  const { data: inserted, error: insErr } = await admin
    .from('masters')
    .insert({
      kind: item.kind,
      name: item.name,
      sort_order: item.sort_order,
      is_active: true,
    })
    .select('id')
    .single();
  if (insErr) throw insErr;
  return inserted.id;
}

async function main() {
  const memberIds = {};
  for (const m of FIXTURE_MEMBERS) {
    const { data, error } = await admin
      .from('members')
      .select('id')
      .ilike('email', m.email)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new Error(
        `土台のメンバー「${m.name}」が見つかりません。先に npm run fixtures:load を実行してください。`,
      );
    }
    memberIds[m.key] = data.id;
  }

  const { data: ceoRow, error: ceoErr } = await admin
    .from('members')
    .select('id')
    .eq('name', TEST_CEO_NAME)
    .maybeSingle();
  if (ceoErr) throw ceoErr;
  const ceoId = ceoRow?.id ?? null;

  // 1. 一覧（masters）の部下メモのテーマ7つと種類4つ
  const masterIds = {};
  for (const item of FIXTURE_MEMO_MASTERS) {
    masterIds[item.key] = await ensureMaster(item);
  }

  // 2. 部下メモと対象者
  for (const memo of FIXTURE_SUBORDINATE_MEMOS) {
    let writerId = null;
    if (memo.writerMemberKey === '__TEST_CEO__') {
      if (!ceoId) continue; // テスト代表がいなければ入れない
      writerId = ceoId;
    } else {
      writerId = memberIds[memo.writerMemberKey];
    }

    const { data: existingMemo, error: memoSelErr } = await admin
      .from('subordinate_memos')
      .select('id')
      .eq('created_by', writerId)
      .eq('date', memo.date)
      .eq('noticed', memo.noticed)
      .maybeSingle();
    if (memoSelErr) throw memoSelErr;

    let memoId = existingMemo?.id;
    if (!memoId) {
      const { data: insertedMemo, error: memoInsErr } = await admin
        .from('subordinate_memos')
        .insert({
          date: memo.date,
          created_by: writerId,
          theme_id: masterIds[memo.themeKey],
          kind_id: masterIds[memo.kindKey],
          noticed: memo.noticed,
          guidance: memo.guidance,
          next_check_on: memo.next_check_on,
          action_check: memo.action_check,
          result_check: memo.result_check,
          checked_on: memo.checked_on,
          submitted_at: memo.submitted_at,
        })
        .select('id')
        .single();
      if (memoInsErr) throw memoInsErr;
      memoId = insertedMemo.id;
    }

    for (const targetKey of memo.targetMemberKeys) {
      const targetMemberId = memberIds[targetKey];
      const { data: existingTarget, error: tgtSelErr } = await admin
        .from('subordinate_memo_targets')
        .select('memo_id')
        .eq('memo_id', memoId)
        .eq('member_id', targetMemberId)
        .maybeSingle();
      if (tgtSelErr) throw tgtSelErr;

      if (!existingTarget) {
        const { error: tgtInsErr } = await admin.from('subordinate_memo_targets').insert({
          memo_id: memoId,
          member_id: targetMemberId,
        });
        if (tgtInsErr) throw tgtInsErr;
      }
    }
  }

  console.log('部下メモの架空データ（一覧のテーマ7つ・種類4つ・部下メモ）を投入しました。');
}

main().catch((err) => {
  console.error('部下メモ架空データの投入中にエラーが発生しました:', err?.message ?? err);
  process.exit(1);
});
