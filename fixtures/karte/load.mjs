import { createClient } from '@supabase/supabase-js';
import { FIXTURE_MEMBERS, FIXTURE_TEAMS, TEST_CEO_NAME } from '../foundation/data.mjs';
import {
  FIXTURE_KARTE_SETTINGS,
  FIXTURE_KARTE_TARGETS,
  FIXTURE_LEGACY_MEMOS,
  FIXTURE_LEGACY_ROLEPLAYS,
  FIXTURE_RETIRED_MEMBER,
  FIXTURE_RETIRED_MEMOS,
  FIXTURE_RETIRED_ROLEPLAYS,
  KARTE_KPI_DATES,
  KPI_TIME_SLOTS,
  RETIRED_MEMBER_KPI_DATES,
  buildKarteSlotNumbers,
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

async function main() {
  // 1. 土台・ロープレ・KPI・部下メモの前提データを確認
  const teamIds = {};
  for (const t of FIXTURE_TEAMS) {
    const { data, error } = await admin.from('teams').select('id').eq('name', t.name).maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new Error(
        `土台のチーム「${t.name}」が見つかりません。先に土台 → ロープレ → KPI → 部下メモの架空データを入れてください。`,
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

  // ロープレのテーマ一覧を確認
  const { data: themesData, error: themesErr } = await admin
    .from('roleplay_themes')
    .select('id, no');
  if (themesErr) throw themesErr;
  const themeIdByNo = new Map((themesData ?? []).map((t) => [t.no, t.id]));
  if (themeIdByNo.size === 0) {
    throw new Error(
      'ロープレのテーマが見つかりません。先に npm run fixtures:roleplay:load を実行してください。',
    );
  }

  // 部下メモのテーマ・種類の一覧を確認
  const { data: mastersData, error: mastersErr } = await admin
    .from('masters')
    .select('id, kind, name')
    .in('kind', ['memo_theme', 'memo_kind']);
  if (mastersErr) throw mastersErr;
  const memoThemeIdByName = new Map();
  const memoKindIdByName = new Map();
  for (const m of mastersData ?? []) {
    if (m.kind === 'memo_theme') memoThemeIdByName.set(m.name, m.id);
    if (m.kind === 'memo_kind') memoKindIdByName.set(m.name, m.id);
  }
  if (memoThemeIdByName.size === 0 || memoKindIdByName.size === 0) {
    throw new Error(
      '部下メモの一覧（テーマ・種類）が見つかりません。先に npm run fixtures:memo:load を実行してください。',
    );
  }

  // 2. 設定値（karte_call_hour_threshold・kpi_workdays）
  for (const s of FIXTURE_KARTE_SETTINGS) {
    await ensureSetting(s, ceoId ?? memberIds.leaderB);
  }

  // 3. 退職した人（架空退職メンバー）と所属の履歴
  const { data: existingRetired, error: retSelErr } = await admin
    .from('members')
    .select('id')
    .ilike('email', FIXTURE_RETIRED_MEMBER.email)
    .maybeSingle();
  if (retSelErr) throw retSelErr;

  let retiredMemberId = existingRetired?.id;
  if (!retiredMemberId) {
    const { data: insertedRet, error: retInsErr } = await admin
      .from('members')
      .insert({
        email: FIXTURE_RETIRED_MEMBER.email,
        name: FIXTURE_RETIRED_MEMBER.name,
        role: FIXTURE_RETIRED_MEMBER.role,
        goes_to_sales: FIXTURE_RETIRED_MEMBER.goes_to_sales,
        hired_on: FIXTURE_RETIRED_MEMBER.hired_on,
        retired_on: FIXTURE_RETIRED_MEMBER.retired_on,
      })
      .select('id')
      .single();
    if (retInsErr) throw retInsErr;
    retiredMemberId = insertedRet.id;
  }
  memberIds[FIXTURE_RETIRED_MEMBER.key] = retiredMemberId;

  const { data: existingRetAff, error: retAffSelErr } = await admin
    .from('member_affiliations')
    .select('id')
    .eq('member_id', retiredMemberId)
    .limit(1);
  if (retAffSelErr) throw retAffSelErr;

  if (!existingRetAff || existingRetAff.length === 0) {
    const { error: retAffInsErr } = await admin.from('member_affiliations').insert({
      member_id: retiredMemberId,
      team_id: teamIds[FIXTURE_RETIRED_MEMBER.teamKey],
      base: FIXTURE_RETIRED_MEMBER.base,
      start_date: FIXTURE_RETIRED_MEMBER.affiliation_start,
      end_date: FIXTURE_RETIRED_MEMBER.affiliation_end,
    });
    if (retAffInsErr) throw retAffInsErr;
  }

  // 4. 月の目標（9月・10月分：leaderA・memberA・memberB・retiredA）
  for (const tgt of FIXTURE_KARTE_TARGETS) {
    const mId = memberIds[tgt.memberKey];
    const { data: existingTgt, error: tgtSelErr } = await admin
      .from('kpi_targets')
      .select('id')
      .eq('member_id', mId)
      .eq('month', tgt.month)
      .maybeSingle();
    if (tgtSelErr) throw tgtSelErr;

    if (!existingTgt) {
      const { error: tgtInsErr } = await admin.from('kpi_targets').insert({
        member_id: mId,
        month: tgt.month,
        goes_to_sales: tgt.goes_to_sales,
        target_profit: tgt.target_profit,
        unit_price: tgt.unit_price,
        completion_rate: tgt.completion_rate,
        rate_order: tgt.rate_order,
        apo_target: tgt.apo_target,
        working_days: tgt.working_days,
        call_hours: tgt.call_hours,
        term: tgt.term,
        rate_connected: tgt.rate_connected,
        rate_recall: tgt.rate_recall,
        rate_owner: tgt.rate_owner,
        rate_prospect: tgt.rate_prospect,
        rate_apo_owner: tgt.rate_apo_owner,
        rate_adoption: tgt.rate_adoption,
      });
      if (tgtInsErr) throw tgtInsErr;
    }
  }

  // 5. KPI の推移（2026-09-01〜2026-11-06 の対象日、承認済み取り込みと14時間帯の kpi_entries）
  const csvTeamName = '架空チームA(WEB)';
  const importerId = memberIds.leaderB;
  const nowIso = new Date().toISOString();

  for (const targetDate of KARTE_KPI_DATES) {
    const includeRetired = RETIRED_MEMBER_KPI_DATES.has(targetDate);
    const activeMemberKeys = includeRetired
      ? ['leaderA', 'memberA', 'memberB', 'retiredA']
      : ['leaderA', 'memberA', 'memberB'];

    const { data: existingLog, error: logSelErr } = await admin
      .from('import_logs')
      .select('id')
      .eq('target_date', targetDate)
      .eq('csv_team_name', csvTeamName)
      .neq('status', 'replaced')
      .maybeSingle();
    if (logSelErr) throw logSelErr;

    let logId = existingLog?.id;
    if (!logId) {
      const compactDate = targetDate.replaceAll('-', '');
      const { data: insertedLog, error: logInsErr } = await admin
        .from('import_logs')
        .insert({
          target_date: targetDate,
          csv_team_name: csvTeamName,
          team_id: teamIds.teamA,
          file_name: `${compactDate}_架空チームA(WEB)時間別_karte.csv`,
          row_count: activeMemberKeys.length,
          error_count: 0,
          totals_match: true,
          notes: [],
          status: 'approved',
          imported_by: importerId,
          approved_by: importerId,
          approved_at: nowIso,
          approval_kind: 'manual',
          alerts_created_at: nowIso,
          alert_count: 0,
        })
        .select('id')
        .single();
      if (logInsErr) throw logInsErr;
      logId = insertedLog.id;
    }

    const { data: existingEntries, error: entSelErr } = await admin
      .from('kpi_entries')
      .select('id')
      .eq('import_log_id', logId)
      .limit(1);
    if (entSelErr) throw entSelErr;

    if (!existingEntries || existingEntries.length === 0) {
      const entryRows = [];
      for (const mKey of activeMemberKeys) {
        const mId = memberIds[mKey];
        for (const slot of KPI_TIME_SLOTS) {
          const nums = buildKarteSlotNumbers(mKey, targetDate, slot);
          entryRows.push({
            import_log_id: logId,
            member_id: mId,
            date: targetDate,
            time_slot: slot,
            ...nums,
          });
        }
      }
      const { error: entInsErr } = await admin.from('kpi_entries').insert(entryRows);
      if (entInsErr) throw entInsErr;
    }
  }

  // 6. 退職した人のロープレ記録と、過去の形のロープレ記録3件
  const allRoleplays = [
    ...FIXTURE_RETIRED_ROLEPLAYS.map((r) => ({ ...r, is_legacy: false, legacy_source: null })),
    ...FIXTURE_LEGACY_ROLEPLAYS,
  ];

  for (const rp of allRoleplays) {
    const themeId = themeIdByNo.get(rp.themeNo);
    if (!themeId) {
      throw new Error(`ロープレテーマ no=${rp.themeNo} が見つかりません。`);
    }
    const { data: existingRp, error: rpSelErr } = await admin
      .from('roleplays')
      .select('id')
      .eq('member_id', memberIds[rp.memberKey])
      .eq('date', rp.date)
      .eq('fixed_point', rp.fixed_point)
      .maybeSingle();
    if (rpSelErr) throw rpSelErr;

    if (!existingRp) {
      const { error: rpInsErr } = await admin.from('roleplays').insert({
        date: rp.date,
        runner_member_id: memberIds[rp.runnerKey],
        member_id: memberIds[rp.memberKey],
        time_slot: rp.time_slot,
        kind: rp.kind,
        theme_id: themeId,
        minutes: rp.minutes,
        homework_result: rp.homework_result,
        repeat_count: rp.repeat_count,
        pass_result: rp.pass_result,
        next_homework: rp.next_homework,
        fixed_point: rp.fixed_point,
        note: rp.note,
        submitted_at: rp.submitted_at,
        is_legacy: rp.is_legacy,
        legacy_source: rp.legacy_source,
      });
      if (rpInsErr) throw rpInsErr;
    }
  }

  // 7. 退職した人の部下メモと、過去の形の部下メモ3件
  const allMemos = [
    ...FIXTURE_RETIRED_MEMOS.map((m) => ({ ...m, is_legacy: false, legacy_source: null })),
    ...FIXTURE_LEGACY_MEMOS,
  ];

  for (const memo of allMemos) {
    const themeId = memoThemeIdByName.get(memo.themeName);
    const kindId = memoKindIdByName.get(memo.kindName);
    if (!themeId || !kindId) {
      throw new Error(`部下メモの一覧（${memo.themeName} / ${memo.kindName}）が見つかりません。`);
    }

    const { data: existingMemo, error: memoSelErr } = await admin
      .from('subordinate_memos')
      .select('id')
      .eq('created_by', memberIds[memo.writerKey])
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
          created_by: memberIds[memo.writerKey],
          theme_id: themeId,
          kind_id: kindId,
          noticed: memo.noticed,
          guidance: memo.guidance,
          next_check_on: memo.next_check_on,
          action_check: memo.action_check,
          result_check: memo.result_check,
          checked_on: memo.checked_on,
          submitted_at: memo.submitted_at,
          is_legacy: memo.is_legacy,
          legacy_source: memo.legacy_source,
        })
        .select('id')
        .single();
      if (memoInsErr) throw memoInsErr;
      memoId = insertedMemo.id;
    }

    const targetId = memberIds[memo.targetKey];
    const { data: existingTarget, error: tgtSelErr } = await admin
      .from('subordinate_memo_targets')
      .select('memo_id')
      .eq('memo_id', memoId)
      .eq('member_id', targetId)
      .maybeSingle();
    if (tgtSelErr) throw tgtSelErr;

    if (!existingTarget) {
      const { error: tgtInsErr } = await admin.from('subordinate_memo_targets').insert({
        memo_id: memoId,
        member_id: targetId,
      });
      if (tgtInsErr) throw tgtInsErr;
    }
  }

  console.log(
    `カルテの架空データ（設定値2件・KPI推移${KARTE_KPI_DATES.length}日分・9〜10月目標・架空退職メンバー・過去形式のロープレ3件と部下メモ3件）を投入しました。`,
  );
}

main().catch((err) => {
  console.error('カルテ架空データの投入中にエラーが発生しました:', err?.message ?? err);
  process.exit(1);
});
