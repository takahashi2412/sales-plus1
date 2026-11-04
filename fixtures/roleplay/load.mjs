import { createClient } from '@supabase/supabase-js';
import { FIXTURE_MEMBERS, FIXTURE_TEAMS, TEST_CEO_NAME } from '../foundation/data.mjs';
import {
  FIXTURE_MASTERS,
  FIXTURE_SEMINARS,
  FIXTURE_SETTINGS,
  FIXTURE_TALKS,
  FIXTURE_TALK_OWNER_MEMBER_KEY,
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

async function ensureMaster(item) {
  const { data: existing, error: selErr } = await admin
    .from('masters')
    .select('id')
    .eq('kind', item.kind)
    .eq('name', item.name)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing.id;

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

async function ensureSetting(item, updatedBy) {
  const { data: existing, error: selErr } = await admin
    .from('settings')
    .select('key')
    .eq('key', item.key)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return;

  const { error: insErr } = await admin.from('settings').insert({
    key: item.key,
    value: item.value,
    reason: item.reason,
    updated_by: updatedBy ?? null,
    updated_at: new Date().toISOString(),
  });
  if (insErr) throw insErr;
}

async function ensureTheme(item) {
  const { data: existing, error: selErr } = await admin
    .from('roleplay_themes')
    .select('id')
    .eq('name', item.name)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing.id;

  const { data: inserted, error: insErr } = await admin
    .from('roleplay_themes')
    .insert({
      no: item.no,
      stage: item.stage,
      name: item.name,
      kind: item.kind,
      pass_example: item.pass_example,
      is_active: true,
    })
    .select('id')
    .single();
  if (insErr) throw insErr;
  return inserted.id;
}

async function ensureTalk(item, masterIds, teamIds, memberIds) {
  const { data: existing, error: selErr } = await admin
    .from('talks')
    .select('id')
    .eq('code', item.code)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing.id;

  const { data: inserted, error: insErr } = await admin
    .from('talks')
    .insert({
      code: item.code,
      scene_id: item.sceneKey ? masterIds[item.sceneKey] : null,
      industry_id: item.industryKey ? masterIds[item.industryKey] : null,
      list_type_id: item.listTypeKey ? masterIds[item.listTypeKey] : null,
      their_words: item.their_words,
      wording: item.wording,
      aim: item.aim,
      team_id: item.teamKey ? teamIds[item.teamKey] : null,
      created_by: memberIds[item.creatorMemberKey],
      status: item.status,
    })
    .select('id')
    .single();
  if (insErr) throw insErr;
  return inserted.id;
}

async function main() {
  // 1. 土台のチームとメンバーを取得（先に npm run fixtures:load が必要）
  const teamIds = {};
  for (const t of FIXTURE_TEAMS) {
    const { data, error } = await admin.from('teams').select('id').eq('name', t.name).maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new Error(
        `土台のチーム「${t.name}」が見つかりません。先に npm run fixtures:load を実行してください。`,
      );
    }
    teamIds[t.key] = data.id;
  }

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

  // 2. 架空のトーク責任者権限（talk_owner）を付与
  const talkOwnerMemberId = memberIds[FIXTURE_TALK_OWNER_MEMBER_KEY];
  const { data: existingTalkPerm, error: permSelErr } = await admin
    .from('permissions')
    .select('id')
    .eq('member_id', talkOwnerMemberId)
    .eq('kind', 'talk_owner')
    .is('revoked_at', null)
    .maybeSingle();
  if (permSelErr) throw permSelErr;
  if (!existingTalkPerm) {
    const { error: permInsErr } = await admin.from('permissions').insert({
      member_id: talkOwnerMemberId,
      kind: 'talk_owner',
      granted_by: ceoId,
      granted_at: new Date().toISOString(),
    });
    if (permInsErr) throw permInsErr;
  }

  // 3. 一覧（masters）と設定値（settings）
  const masterIds = {};
  for (const item of FIXTURE_MASTERS) {
    masterIds[item.key] = await ensureMaster(item);
  }

  for (const item of FIXTURE_SETTINGS) {
    await ensureSetting(item, ceoId);
  }

  // 4. テーマ一覧（段階1〜6の架空の例）
  const themeIds = {};
  for (const item of FIXTURE_THEMES) {
    themeIds[item.key] = await ensureTheme(item);
  }

  // 5. トーク（確認待ち・試行中・標準）
  const talkIds = {};
  for (const item of FIXTURE_TALKS) {
    talkIds[item.code] = await ensureTalk(item, masterIds, teamIds, memberIds);
  }

  // 6. テーマ表（member_themes）
  const memberThemesToEnsure = [
    {
      memberId: memberIds.memberA,
      themeId: themeIds.theme_s3,
      kind: 'apo',
      started_on: '2026-10-01',
      pass_line: '架空の合格ライン：1回目の断りを受け止めてから時間切りまで進める',
      status: 'practicing',
      graduated_on: null,
      check_on: null,
      created_by: memberIds.leaderA,
    },
    {
      memberId: memberIds.memberA,
      themeId: themeIds.theme_s6,
      kind: 'sales',
      started_on: '2026-10-05',
      pass_line: '架空の合格ライン：現状の集客手段と課題を3つ聞き出せる',
      status: 'practicing',
      graduated_on: null,
      check_on: null,
      created_by: memberIds.leaderA,
    },
    {
      memberId: memberIds.memberB,
      themeId: themeIds.theme_s1,
      kind: 'apo',
      started_on: '2026-09-15',
      pass_line: '架空の合格ライン：台本を見ずに冒頭30秒を言える',
      status: 'graduated',
      graduated_on: '2026-09-25',
      check_on: '2026-10-09',
      created_by: memberIds.leaderA,
    },
  ];

  for (const mt of memberThemesToEnsure) {
    const { data: existingMt, error: mtSelErr } = await admin
      .from('member_themes')
      .select('id')
      .eq('member_id', mt.memberId)
      .eq('theme_id', mt.themeId)
      .is('hidden_at', null)
      .maybeSingle();
    if (mtSelErr) throw mtSelErr;
    if (!existingMt) {
      const { error: mtInsErr } = await admin.from('member_themes').insert({
        member_id: mt.memberId,
        theme_id: mt.themeId,
        kind: mt.kind,
        started_on: mt.started_on,
        pass_line: mt.pass_line,
        status: mt.status,
        graduated_on: mt.graduated_on,
        check_on: mt.check_on,
        created_by: mt.created_by,
      });
      if (mtInsErr) throw mtInsErr;
    }
  }

  // 7. ロープレの記録（roleplays）
  const roleplaysToEnsure = [
    {
      date: '2026-10-10',
      runner_member_id: memberIds.leaderA,
      member_id: memberIds.memberA,
      time_slot: '10',
      kind: 'apo',
      theme_id: themeIds.theme_s3,
      used_talk_id: talkIds['OUT-FIXTURE-001'],
      minutes: 15,
      homework_result: 'd',
      repeat_count: 3,
      pass_result: 'o',
      next_homework: '架空の宿題：返しを録音して聞き直す',
      fixed_point: '架空の直した点：受け止めの一言を短くして時間切りへつないだ',
      note: '架空の申し送り：声のトーンが安定してきた',
      submitted_at: '2026-10-10T01:30:00Z',
    },
    {
      date: '2026-10-12',
      runner_member_id: memberIds.leaderA,
      member_id: memberIds.memberB,
      time_slot: '14',
      kind: 'apo',
      theme_id: themeIds.theme_s1,
      used_talk_id: talkIds['OUT-FIXTURE-002'],
      minutes: 10,
      homework_result: 'o',
      repeat_count: 2,
      pass_result: 'o',
      next_homework: '架空の宿題：次の段階の台本を読んでくる',
      fixed_point: '架空の直した点：名乗りのあとに一拍置くように直した',
      note: null,
      submitted_at: '2026-10-12T05:20:00Z',
    },
  ];

  for (const rp of roleplaysToEnsure) {
    const { data: existingRp, error: rpSelErr } = await admin
      .from('roleplays')
      .select('id')
      .eq('member_id', rp.member_id)
      .eq('date', rp.date)
      .eq('fixed_point', rp.fixed_point)
      .maybeSingle();
    if (rpSelErr) throw rpSelErr;
    if (!existingRp) {
      const { error: rpInsErr } = await admin.from('roleplays').insert(rp);
      if (rpInsErr) throw rpInsErr;
    }
  }

  // 8. 研修と参加者（seminars / seminar_members）
  for (const sem of FIXTURE_SEMINARS) {
    const { data: existingSem, error: semSelErr } = await admin
      .from('seminars')
      .select('id')
      .eq('theme', sem.theme)
      .eq('date', sem.date)
      .maybeSingle();
    if (semSelErr) throw semSelErr;

    let seminarId = existingSem?.id;
    if (!seminarId) {
      const { data: insertedSem, error: semInsErr } = await admin
        .from('seminars')
        .insert({
          date: sem.date,
          theme: sem.theme,
          lecturer: sem.lecturer,
          minutes: sem.minutes,
          content: sem.content,
          created_by: memberIds[sem.creatorMemberKey],
        })
        .select('id')
        .single();
      if (semInsErr) throw semInsErr;
      seminarId = insertedSem.id;
    }

    for (const partKey of sem.participantMemberKeys) {
      const pMemberId = memberIds[partKey];
      const { data: existingPart, error: partSelErr } = await admin
        .from('seminar_members')
        .select('seminar_id')
        .eq('seminar_id', seminarId)
        .eq('member_id', pMemberId)
        .maybeSingle();
      if (partSelErr) throw partSelErr;
      if (!existingPart) {
        const { error: partInsErr } = await admin.from('seminar_members').insert({
          seminar_id: seminarId,
          member_id: pMemberId,
        });
        if (partInsErr) throw partInsErr;
      }
    }
  }

  console.log('ロープレ・研修・一覧・設定値の架空データを投入しました。');
}

main().catch((err) => {
  console.error('ロープレ架空データの投入中にエラーが発生しました:', err?.message ?? err);
  process.exit(1);
});
