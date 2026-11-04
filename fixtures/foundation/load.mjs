import { createClient } from '@supabase/supabase-js';
import { FIXTURE_MEMBERS, FIXTURE_TEAMS, TEST_CEO_NAME } from './data.mjs';

const url = process.env.SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const devEmail = (process.env.DEV_LOGIN_EMAIL ?? '').trim();

if (!url || !serviceKey || !devEmail) {
  console.error(
    '必要な環境変数（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DEV_LOGIN_EMAIL）が設定されていません。',
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function ensureTeam(name) {
  const { data: existing, error: selErr } = await admin
    .from('teams')
    .select('id, name')
    .eq('name', name)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing.id;

  const { data: inserted, error: insErr } = await admin
    .from('teams')
    .insert({ name })
    .select('id')
    .single();
  if (insErr) throw insErr;
  return inserted.id;
}

async function ensureMember({ email, name, role, goes_to_sales, hired_on }) {
  const { data: existing, error: selErr } = await admin
    .from('members')
    .select('id, email')
    .ilike('email', email)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing.id;

  const { data: inserted, error: insErr } = await admin
    .from('members')
    .insert({
      auth_user_id: null,
      email,
      name,
      role,
      goes_to_sales,
      hired_on,
    })
    .select('id')
    .single();
  if (insErr) throw insErr;
  return inserted.id;
}

async function main() {
  const teamIds = {};
  for (const t of FIXTURE_TEAMS) {
    teamIds[t.key] = await ensureTeam(t.name);
  }

  const memberIds = {};
  for (const m of FIXTURE_MEMBERS) {
    memberIds[m.key] = await ensureMember(m);
  }

  const ceoId = await ensureMember({
    email: devEmail,
    name: TEST_CEO_NAME,
    role: 'ceo',
    goes_to_sales: false,
    hired_on: '2024-04-01',
  });

  for (const m of FIXTURE_MEMBERS) {
    if (m.teamKey) {
      const memberId = memberIds[m.key];
      const teamId = teamIds[m.teamKey];
      const { data: existingAff, error: affSelErr } = await admin
        .from('member_affiliations')
        .select('id')
        .eq('member_id', memberId)
        .eq('team_id', teamId)
        .is('end_date', null)
        .maybeSingle();
      if (affSelErr) throw affSelErr;
      if (!existingAff) {
        const { error: affInsErr } = await admin.from('member_affiliations').insert({
          member_id: memberId,
          team_id: teamId,
          base: m.base,
          start_date: m.hired_on,
          end_date: null,
        });
        if (affInsErr) throw affInsErr;
      }
    }

    if (m.assignedTeamKey) {
      const mgrId = memberIds[m.key];
      const teamId = teamIds[m.assignedTeamKey];
      const { data: existingAsg, error: asgSelErr } = await admin
        .from('mgr_assignments')
        .select('id')
        .eq('mgr_member_id', mgrId)
        .eq('team_id', teamId)
        .is('end_date', null)
        .maybeSingle();
      if (asgSelErr) throw asgSelErr;
      if (!existingAsg) {
        const { error: asgInsErr } = await admin.from('mgr_assignments').insert({
          mgr_member_id: mgrId,
          team_id: teamId,
          start_date: '2025-04-01',
          end_date: null,
          assigned_by: ceoId,
        });
        if (asgInsErr) throw asgInsErr;
      }
    }

    if (m.isAdmin) {
      const memberId = memberIds[m.key];
      const { data: existingPerm, error: permSelErr } = await admin
        .from('permissions')
        .select('id')
        .eq('member_id', memberId)
        .eq('kind', 'admin')
        .is('revoked_at', null)
        .maybeSingle();
      if (permSelErr) throw permSelErr;
      if (!existingPerm) {
        const { error: permInsErr } = await admin.from('permissions').insert({
          member_id: memberId,
          kind: 'admin',
          granted_by: ceoId,
          granted_at: new Date().toISOString(),
        });
        if (permInsErr) throw permInsErr;
      }
    }
  }

  console.log('架空の名簿データ（テスト代表を含む）を投入しました。');
}

main().catch((err) => {
  console.error('架空データの投入中にエラーが発生しました:', err?.message ?? err);
  process.exit(1);
});
