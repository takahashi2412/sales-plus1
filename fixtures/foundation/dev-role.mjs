import { createClient } from '@supabase/supabase-js';
import { FIXTURE_TEAMS, TEST_CEO_NAME } from './data.mjs';
import { DEV_ROLE_USAGE, resolveDevRolePlan } from './dev-role-plan.mjs';

const args = process.argv.slice(2);
const plan = args.length === 1 ? resolveDevRolePlan(args[0]) : null;

if (!plan) {
  console.error(DEV_ROLE_USAGE);
  process.exit(1);
}

const url = (process.env.SUPABASE_URL ?? '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
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

function failStep(stepLabel, error) {
  const message =
    error && typeof error.message === 'string'
      ? error.message
      : String(error ?? '不明なエラー');
  console.error(`切り替えられなかった：${stepLabel}：${message}`);
  process.exit(1);
}

async function main() {
  const { data: nameMatchedRows, error: memberSelErr } = await admin
    .from('members')
    .select('id, email, name')
    .eq('name', TEST_CEO_NAME);
  if (memberSelErr) {
    failStep('テスト代表の検索', memberSelErr);
  }

  const matchedMembers = (nameMatchedRows ?? []).filter(
    (r) => typeof r.email === 'string' && r.email.toLowerCase() === devEmail.toLowerCase(),
  );

  if (matchedMembers.length === 0) {
    console.error('テスト代表の行がありません。先に npm run fixtures:load を流してください');
    process.exit(1);
  }
  if (matchedMembers.length > 1) {
    console.error('テスト代表の行が複数見つかりました。名簿の状態を確認してください');
    process.exit(1);
  }

  const ceoId = matchedMembers[0]?.id;
  if (!ceoId) {
    console.error('テスト代表の行を確認できませんでした。');
    process.exit(1);
  }

  const fixtureTeamNames = FIXTURE_TEAMS.map((t) => t.name);
  const { data: teamRows, error: teamSelErr } = await admin
    .from('teams')
    .select('id, name')
    .in('name', fixtureTeamNames);
  if (teamSelErr) {
    failStep('チームの検索', teamSelErr);
  }

  const teamIdByName = new Map();
  for (const row of teamRows ?? []) {
    if (row && typeof row.name === 'string' && typeof row.id === 'string') {
      teamIdByName.set(row.name, row.id);
    }
  }

  for (const teamName of fixtureTeamNames) {
    if (!teamIdByName.has(teamName)) {
      console.error('先に npm run fixtures:load を流してください');
      process.exit(1);
    }
  }

  const { error: permDelErr } = await admin
    .from('permissions')
    .delete()
    .eq('member_id', ceoId);
  if (permDelErr) {
    failStep('権限の削除', permDelErr);
  }

  const { error: mgrDelErr } = await admin
    .from('mgr_assignments')
    .delete()
    .eq('mgr_member_id', ceoId);
  if (mgrDelErr) {
    failStep('MGRの担当の削除', mgrDelErr);
  }

  const { error: affDelErr } = await admin
    .from('member_affiliations')
    .delete()
    .eq('member_id', ceoId);
  if (affDelErr) {
    failStep('所属の削除', affDelErr);
  }

  const { error: roleUpdErr } = await admin
    .from('members')
    .update({ role: plan.role })
    .eq('id', ceoId);
  if (roleUpdErr) {
    failStep('役割の更新', roleUpdErr);
  }

  if (plan.affiliation) {
    const teamId = teamIdByName.get(plan.affiliation.teamName);
    if (!teamId) {
      console.error('先に npm run fixtures:load を流してください');
      process.exit(1);
    }
    const { error: affInsErr } = await admin.from('member_affiliations').insert({
      member_id: ceoId,
      team_id: teamId,
      base: plan.affiliation.base,
      start_date: plan.affiliation.start_date,
      end_date: plan.affiliation.end_date,
    });
    if (affInsErr) {
      failStep('所属の追加', affInsErr);
    }
  }

  if (plan.mgrAssignment) {
    const teamId = teamIdByName.get(plan.mgrAssignment.teamName);
    if (!teamId) {
      console.error('先に npm run fixtures:load を流してください');
      process.exit(1);
    }
    const { error: mgrInsErr } = await admin.from('mgr_assignments').insert({
      mgr_member_id: ceoId,
      team_id: teamId,
      start_date: plan.mgrAssignment.start_date,
      end_date: plan.mgrAssignment.end_date,
      assigned_by: plan.mgrAssignment.assigned_by,
    });
    if (mgrInsErr) {
      failStep('MGRの担当の追加', mgrInsErr);
    }
  }

  if (plan.permission) {
    const { error: permInsErr } = await admin.from('permissions').insert({
      member_id: ceoId,
      kind: plan.permission.kind,
      granted_by: plan.permission.granted_by,
      revoked_by: plan.permission.revoked_by,
      revoked_at: plan.permission.revoked_at,
    });
    if (permInsErr) {
      failStep('権限の追加', permInsErr);
    }
  }

  console.log(
    `テスト代表を${plan.label}に切り替えました。画面を読み込み直すか、ログインし直してください`,
  );
}

main().catch((err) => {
  failStep('予期しないエラー', err);
});
