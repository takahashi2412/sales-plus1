import { createClient } from '@supabase/supabase-js';
import { FIXTURE_MEMBERS, FIXTURE_TEAMS, TEST_CEO_NAME } from './data.mjs';

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
  const fixtureEmails = FIXTURE_MEMBERS.map((m) => m.email);

  const { data: byEmail, error: emailErr } = await admin
    .from('members')
    .select('id')
    .in('email', fixtureEmails);
  if (emailErr) throw emailErr;

  const { data: byCeoName, error: ceoErr } = await admin
    .from('members')
    .select('id')
    .eq('name', TEST_CEO_NAME);
  if (ceoErr) throw ceoErr;

  const memberIds = Array.from(
    new Set([...(byEmail ?? []).map((r) => r.id), ...(byCeoName ?? []).map((r) => r.id)]),
  );

  if (memberIds.length > 0) {
    await admin.from('permissions').update({ granted_by: null }).in('granted_by', memberIds);
    await admin.from('permissions').update({ revoked_by: null }).in('revoked_by', memberIds);
    await admin.from('mgr_assignments').update({ assigned_by: null }).in('assigned_by', memberIds);
    await admin.from('permissions').delete().in('member_id', memberIds);
    await admin.from('mgr_assignments').delete().in('mgr_member_id', memberIds);
    await admin.from('member_affiliations').delete().in('member_id', memberIds);
    const { error: delMemErr } = await admin.from('members').delete().in('id', memberIds);
    if (delMemErr) throw delMemErr;
  }

  const teamNames = FIXTURE_TEAMS.map((t) => t.name);
  const { error: delTeamErr } = await admin.from('teams').delete().in('name', teamNames);
  if (delTeamErr) throw delTeamErr;

  console.log('架空の名簿データをすべて削除しました。');
}

main().catch((err) => {
  console.error('架空データの削除中にエラーが発生しました:', err?.message ?? err);
  process.exit(1);
});
