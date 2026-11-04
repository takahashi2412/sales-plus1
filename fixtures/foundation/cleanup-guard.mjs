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

async function main() {
  const { data: guardMembers, error: memSelErr } = await admin
    .from('members')
    .select('id')
    .like('name', 'guard%');
  if (memSelErr) throw memSelErr;

  const memberIds = (guardMembers ?? []).map((m) => m.id);
  if (memberIds.length > 0) {
    await admin.from('permissions').update({ granted_by: null }).in('granted_by', memberIds);
    await admin.from('permissions').update({ revoked_by: null }).in('revoked_by', memberIds);
    await admin.from('mgr_assignments').update({ assigned_by: null }).in('assigned_by', memberIds);
    await admin.from('permissions').delete().in('member_id', memberIds);
    await admin.from('mgr_assignments').delete().in('mgr_member_id', memberIds);
    await admin.from('member_affiliations').delete().in('member_id', memberIds);
    await admin.from('members').delete().in('id', memberIds);
  }

  await admin.from('teams').delete().like('name', 'guard%');

  const { data: usersData, error: usersErr } = await admin.auth.admin.listUsers();
  if (usersErr) throw usersErr;

  const testUsers = (usersData?.users ?? []).filter(
    (u) => u.email && u.email.endsWith('@example.test'),
  );
  for (const u of testUsers) {
    await admin.auth.admin.deleteUser(u.id);
  }

  console.log(
    `守りのテストの残りデータを片づけました（名簿: ${memberIds.length}件、利用者: ${testUsers.length}件）。`,
  );
}

main().catch((err) => {
  console.error('片づけ中にエラーが発生しました:', err?.message ?? err);
  process.exit(1);
});
