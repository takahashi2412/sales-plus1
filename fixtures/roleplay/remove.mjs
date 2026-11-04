import { createClient } from '@supabase/supabase-js';
import { FIXTURE_MEMBERS, TEST_CEO_NAME } from '../foundation/data.mjs';
import {
  FIXTURE_MASTERS,
  FIXTURE_SEMINARS,
  FIXTURE_SETTINGS,
  FIXTURE_TALKS,
  FIXTURE_THEMES,
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

  // 監査ログ片づけ用に対象の row_id を集める
  const auditRowIds = [...FIXTURE_SETTINGS.map((s) => s.key)];

  // 1. 研修の参加者と研修
  const seminarThemes = FIXTURE_SEMINARS.map((s) => s.theme);
  const { data: semRows, error: semSelErr } = await admin
    .from('seminars')
    .select('id')
    .in('theme', seminarThemes);
  checkError('seminars（検索）', semSelErr);
  const seminarIds = (semRows ?? []).map((s) => s.id);

  if (seminarIds.length > 0) {
    const { error: smDelErr } = await admin
      .from('seminar_members')
      .delete()
      .in('seminar_id', seminarIds);
    checkError('seminar_members（seminar_id）', smDelErr);
  }
  if (memberIds.length > 0) {
    const { error: smMemDelErr } = await admin
      .from('seminar_members')
      .delete()
      .in('member_id', memberIds);
    checkError('seminar_members（member_id）', smMemDelErr);

    const { error: semMemDelErr } = await admin
      .from('seminars')
      .delete()
      .in('created_by', memberIds);
    checkError('seminars（created_by）', semMemDelErr);
  }
  if (seminarIds.length > 0) {
    const { error: semDelErr } = await admin.from('seminars').delete().in('id', seminarIds);
    checkError('seminars（id）', semDelErr);
  }

  // 2. ロープレの記録とテーマ表
  if (memberIds.length > 0) {
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
  }

  // 3. トーク
  const talkCodes = FIXTURE_TALKS.map((t) => t.code);
  const { data: talkRows, error: talkSelErr } = await admin
    .from('talks')
    .select('id')
    .in('code', talkCodes);
  checkError('talks（検索）', talkSelErr);
  const talkIds = (talkRows ?? []).map((t) => t.id);

  if (talkIds.length > 0) {
    const { error: rpTalkErr } = await admin
      .from('roleplays')
      .delete()
      .in('used_talk_id', talkIds);
    checkError('roleplays（used_talk_id）', rpTalkErr);

    const { error: talkDelErr } = await admin.from('talks').delete().in('id', talkIds);
    checkError('talks（id）', talkDelErr);
  }
  if (memberIds.length > 0) {
    const { error: talkMemDelErr } = await admin
      .from('talks')
      .delete()
      .in('created_by', memberIds);
    checkError('talks（created_by）', talkMemDelErr);
  }

  // 4. テーマ一覧
  const themeNames = FIXTURE_THEMES.map((t) => t.name);
  const { data: themeRows, error: themeSelErr } = await admin
    .from('roleplay_themes')
    .select('id')
    .in('name', themeNames);
  checkError('roleplay_themes（検索）', themeSelErr);
  const themeIds = (themeRows ?? []).map((t) => t.id);
  if (themeIds.length > 0) {
    const { error: rpThErr } = await admin.from('roleplays').delete().in('theme_id', themeIds);
    checkError('roleplays（theme_id）', rpThErr);
    const { error: mtThErr } = await admin.from('member_themes').delete().in('theme_id', themeIds);
    checkError('member_themes（theme_id）', mtThErr);
    const { error: thDelErr } = await admin.from('roleplay_themes').delete().in('id', themeIds);
    checkError('roleplay_themes', thDelErr);
  }

  // 5. 一覧（masters）と設定値（settings）と talk_owner 権限
  const masterNames = FIXTURE_MASTERS.map((m) => m.name);
  const { data: masterRows, error: masterSelErr } = await admin
    .from('masters')
    .select('id')
    .in('name', masterNames);
  checkError('masters（検索）', masterSelErr);
  for (const m of masterRows ?? []) {
    auditRowIds.push(String(m.id));
  }
  if ((masterRows ?? []).length > 0) {
    const { error: masterDelErr } = await admin
      .from('masters')
      .delete()
      .in(
        'id',
        (masterRows ?? []).map((m) => m.id),
      );
    checkError('masters', masterDelErr);
  }

  const settingKeys = FIXTURE_SETTINGS.map((s) => s.key);
  const { error: setDelErr } = await admin.from('settings').delete().in('key', settingKeys);
  checkError('settings', setDelErr);

  if (memberIds.length > 0) {
    const { data: permRows, error: permSelErr } = await admin
      .from('permissions')
      .select('id')
      .in('member_id', memberIds)
      .eq('kind', 'talk_owner');
    checkError('permissions（talk_owner 検索）', permSelErr);
    for (const p of permRows ?? []) {
      auditRowIds.push(String(p.id));
    }
    if ((permRows ?? []).length > 0) {
      const { error: permDelErr } = await admin
        .from('permissions')
        .delete()
        .in(
          'id',
          (permRows ?? []).map((p) => p.id),
        );
      checkError('permissions（talk_owner）', permDelErr);
    }
  }

  // 6. 監査ログの片づけ
  if (auditRowIds.length > 0) {
    const { error: auditDelErr } = await admin
      .from('audit_logs')
      .delete()
      .in('row_id', Array.from(new Set(auditRowIds)));
    checkError('audit_logs', auditDelErr);
  }

  console.log('ロープレ・研修・一覧・設定値の架空データをすべて削除しました。');
}

main().catch((err) => {
  console.error('消せなかった:', err?.message ?? err);
  process.exit(1);
});
