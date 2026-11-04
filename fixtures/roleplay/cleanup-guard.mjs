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

  if (memberIds.length > 0) {
    // 研修の参加者 → 研修
    const { data: guardSeminars, error: semSelErr } = await admin
      .from('seminars')
      .select('id')
      .in('created_by', memberIds);
    checkError('seminars（検索）', semSelErr);
    const seminarIds = (guardSeminars ?? []).map((s) => s.id);

    if (seminarIds.length > 0) {
      const { error: smBySemErr } = await admin
        .from('seminar_members')
        .delete()
        .in('seminar_id', seminarIds);
      checkError('seminar_members（seminar_id）', smBySemErr);
    }

    const { error: smByMemErr } = await admin
      .from('seminar_members')
      .delete()
      .in('member_id', memberIds);
    checkError('seminar_members（member_id）', smByMemErr);

    const { error: semDelErr } = await admin
      .from('seminars')
      .delete()
      .in('created_by', memberIds);
    checkError('seminars（created_by）', semDelErr);

    // ロープレ・テーマ表・トーク
    const { error: rpMemErr } = await admin.from('roleplays').delete().in('member_id', memberIds);
    checkError('roleplays（member_id）', rpMemErr);

    const { error: rpRunErr } = await admin
      .from('roleplays')
      .delete()
      .in('runner_member_id', memberIds);
    checkError('roleplays（runner_member_id）', rpRunErr);

    const { error: mtMemErr } = await admin
      .from('member_themes')
      .delete()
      .in('member_id', memberIds);
    checkError('member_themes（member_id）', mtMemErr);

    const { error: mtCreErr } = await admin
      .from('member_themes')
      .delete()
      .in('created_by', memberIds);
    checkError('member_themes（created_by）', mtCreErr);

    const { error: talkDelErr } = await admin
      .from('talks')
      .delete()
      .in('created_by', memberIds);
    checkError('talks（created_by）', talkDelErr);

    // 監査ログ用に permissions の id を控える
    const { data: guardPerms, error: permSelErr } = await admin
      .from('permissions')
      .select('id')
      .in('member_id', memberIds);
    checkError('permissions（guard検索）', permSelErr);
    for (const p of guardPerms ?? []) {
      auditRowIds.push(String(p.id));
    }
  }

  // 名前が guard で始まる研修・トークが残っていれば消す
  const { data: guardSemByTheme, error: semThemeSelErr } = await admin
    .from('seminars')
    .select('id')
    .like('theme', 'guard%');
  checkError('seminars（theme guard検索）', semThemeSelErr);
  const semIdsByTheme = (guardSemByTheme ?? []).map((s) => s.id);
  if (semIdsByTheme.length > 0) {
    const { error: smErr } = await admin
      .from('seminar_members')
      .delete()
      .in('seminar_id', semIdsByTheme);
    checkError('seminar_members（theme guard）', smErr);
    const { error: sErr } = await admin.from('seminars').delete().in('id', semIdsByTheme);
    checkError('seminars（theme guard）', sErr);
  }

  // 名前が guard で始まるテーマ一覧・一覧・設定値を消す
  const { data: guardThemes, error: thSelErr } = await admin
    .from('roleplay_themes')
    .select('id')
    .like('name', 'guard%');
  checkError('roleplay_themes（guard検索）', thSelErr);
  const guardThemeIds = (guardThemes ?? []).map((t) => t.id);
  if (guardThemeIds.length > 0) {
    const { error: rpThErr } = await admin
      .from('roleplays')
      .delete()
      .in('theme_id', guardThemeIds);
    checkError('roleplays（theme_id）', rpThErr);
    const { error: mtThErr } = await admin
      .from('member_themes')
      .delete()
      .in('theme_id', guardThemeIds);
    checkError('member_themes（theme_id）', mtThErr);
  }
  const { error: thDelErr } = await admin
    .from('roleplay_themes')
    .delete()
    .like('name', 'guard%');
  checkError('roleplay_themes', thDelErr);

  const { data: guardMasters, error: masSelErr } = await admin
    .from('masters')
    .select('id')
    .like('name', 'guard%');
  checkError('masters（guard検索）', masSelErr);
  for (const m of guardMasters ?? []) {
    auditRowIds.push(String(m.id));
  }
  const { error: masDelErr } = await admin.from('masters').delete().like('name', 'guard%');
  checkError('masters', masDelErr);

  const { data: guardSettings, error: setSelErr } = await admin
    .from('settings')
    .select('key')
    .like('key', 'guard%');
  checkError('settings（guard検索）', setSelErr);
  for (const s of guardSettings ?? []) {
    auditRowIds.push(String(s.key));
  }
  const { error: setDelErr } = await admin.from('settings').delete().like('key', 'guard%');
  checkError('settings', setDelErr);

  if (auditRowIds.length > 0) {
    const { error: audDelErr } = await admin
      .from('audit_logs')
      .delete()
      .in('row_id', Array.from(new Set(auditRowIds)));
    checkError('audit_logs', audDelErr);
  }

  console.log(
    `ロープレの守りのテストの残りデータを片づけました（対象名簿: ${memberIds.length}件）。`,
  );
}

main().catch((err) => {
  console.error('消せなかった:', err?.message ?? err);
  process.exit(1);
});
