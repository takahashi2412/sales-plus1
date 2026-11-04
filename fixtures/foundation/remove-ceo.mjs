import { createClient } from '@supabase/supabase-js';
import { TEST_CEO_NAME } from './data.mjs';

const url = process.env.SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const devEmail = (process.env.DEV_LOGIN_EMAIL ?? '').trim();

if (!url || !serviceKey) {
  console.error('必要な環境変数（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）が設定されていません。');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data: ceoRows, error: selErr } = await admin
    .from('members')
    .select('id, email, name')
    .eq('name', TEST_CEO_NAME);
  if (selErr) throw selErr;

  const targetIds = (ceoRows ?? [])
    .filter((r) => !devEmail || r.email.toLowerCase() === devEmail.toLowerCase())
    .map((r) => r.id);

  if (targetIds.length === 0) {
    console.log('「テスト代表」の行は既に存在しません。');
    return;
  }

  await admin.from('permissions').update({ granted_by: null }).in('granted_by', targetIds);
  await admin.from('permissions').update({ revoked_by: null }).in('revoked_by', targetIds);
  await admin.from('mgr_assignments').update({ assigned_by: null }).in('assigned_by', targetIds);
  await admin.from('permissions').delete().in('member_id', targetIds);
  await admin.from('mgr_assignments').delete().in('mgr_member_id', targetIds);
  await admin.from('member_affiliations').delete().in('member_id', targetIds);

  const { error: delErr } = await admin.from('members').delete().in('id', targetIds);
  if (delErr) throw delErr;

  console.log('「テスト代表」の行だけを削除しました。');
}

main().catch((err) => {
  console.error('「テスト代表」の削除中にエラーが発生しました:', err?.message ?? err);
  process.exit(1);
});
