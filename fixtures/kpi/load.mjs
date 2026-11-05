import { createClient } from '@supabase/supabase-js';
import { FIXTURE_MEMBERS, FIXTURE_TEAMS, TEST_CEO_NAME } from '../foundation/data.mjs';
import {
  FIXTURE_ALERTS,
  FIXTURE_CTI_MEMBER_MAP,
  FIXTURE_CTI_TEAM_MAP,
  FIXTURE_IMPORT_LOGS,
  FIXTURE_KPI_SETTINGS,
  FIXTURE_KPI_TARGETS,
  KPI_TIME_SLOTS,
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

function buildSlotNumbers(slot) {
  // 9〜12時・14〜17時の稼働時間帯に架空のコール数を入れ、それ以外の時間帯は0または少数にする
  const activeHour = ['9', '10', '11', '12', '14', '15', '16', '17'].includes(slot);
  if (!activeHour) {
    return { total: 0, connected: 0, recall: 0, owner: 0, prospect: 0, apo: 0 };
  }
  const isMorningPeak = slot === '10' || slot === '15';
  return {
    total: 15,
    connected: 6,
    recall: 4,
    owner: 2,
    prospect: 1,
    apo: isMorningPeak ? 1 : 0,
  };
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

async function main() {
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

  // 1. 設定値（kpi_holidays）
  for (const s of FIXTURE_KPI_SETTINGS) {
    await ensureSetting(s, ceoId ?? memberIds.leaderB);
  }

  // 2. CSVのチーム名の対応（cti_team_map）
  for (const tm of FIXTURE_CTI_TEAM_MAP) {
    const { data: existing, error: selErr } = await admin
      .from('cti_team_map')
      .select('id')
      .eq('csv_team_name', tm.csv_team_name)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!existing) {
      const { error: insErr } = await admin.from('cti_team_map').insert({
        csv_team_name: tm.csv_team_name,
        team_id: teamIds[tm.teamKey],
        valid_from: tm.valid_from,
        valid_to: tm.valid_to,
        created_by: memberIds[tm.creatorMemberKey],
      });
      if (insErr) throw insErr;
    }
  }

  // 3. 名前の対応（cti_member_map）
  for (const mm of FIXTURE_CTI_MEMBER_MAP) {
    const { data: existing, error: selErr } = await admin
      .from('cti_member_map')
      .select('id')
      .eq('cti_name', mm.cti_name)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!existing) {
      const { error: insErr } = await admin.from('cti_member_map').insert({
        cti_name: mm.cti_name,
        member_id: mm.memberKey ? memberIds[mm.memberKey] : null,
        valid_from: mm.valid_from,
        valid_to: mm.valid_to,
        created_by: memberIds[mm.creatorMemberKey],
      });
      if (insErr) throw insErr;
    }
  }

  // 4. 取り込みの記録（import_logs）と日々のKPI（kpi_entries、14区分）
  const logIds = {};
  for (const logItem of FIXTURE_IMPORT_LOGS) {
    const { data: existingLog, error: logSelErr } = await admin
      .from('import_logs')
      .select('id')
      .eq('target_date', logItem.target_date)
      .eq('csv_team_name', logItem.csv_team_name)
      .neq('status', 'replaced')
      .maybeSingle();
    if (logSelErr) throw logSelErr;

    let logId = existingLog?.id;
    if (!logId) {
      const importerId = memberIds[logItem.importerMemberKey];
      const isApproved = logItem.status === 'approved';
      const nowIso = new Date().toISOString();
      const { data: insertedLog, error: logInsErr } = await admin
        .from('import_logs')
        .insert({
          target_date: logItem.target_date,
          csv_team_name: logItem.csv_team_name,
          team_id: teamIds[logItem.teamKey],
          file_name: logItem.file_name,
          row_count: logItem.row_count,
          error_count: logItem.error_count,
          totals_match: logItem.totals_match,
          notes: [],
          status: logItem.status,
          imported_by: importerId,
          approved_by: isApproved ? importerId : null,
          approved_at: isApproved ? nowIso : null,
          approval_kind: isApproved ? 'manual' : null,
        })
        .select('id')
        .single();
      if (logInsErr) throw logInsErr;
      logId = insertedLog.id;
    }
    logIds[logItem.key] = logId;

    const { data: existingEntries, error: entSelErr } = await admin
      .from('kpi_entries')
      .select('id')
      .eq('import_log_id', logId)
      .limit(1);
    if (entSelErr) throw entSelErr;

    if (!existingEntries || existingEntries.length === 0) {
      const entryRows = [];
      for (const mKey of logItem.memberKeys) {
        const mId = memberIds[mKey];
        for (const slot of KPI_TIME_SLOTS) {
          const nums = buildSlotNumbers(slot);
          entryRows.push({
            import_log_id: logId,
            member_id: mId,
            date: logItem.target_date,
            time_slot: slot,
            ...nums,
          });
        }
      }
      const { error: entInsErr } = await admin.from('kpi_entries').insert(entryRows);
      if (entInsErr) throw entInsErr;
    }
  }

  // 5. 月の目標（kpi_targets）
  for (const tgt of FIXTURE_KPI_TARGETS) {
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

  // 6. アラート（alerts）
  for (const al of FIXTURE_ALERTS) {
    const logId = logIds[al.logKey];
    const mId = memberIds[al.memberKey];
    const { data: existingAl, error: alSelErr } = await admin
      .from('alerts')
      .select('id')
      .eq('import_log_id', logId)
      .eq('member_id', mId)
      .eq('compare', al.compare)
      .eq('item', al.item)
      .maybeSingle();
    if (alSelErr) throw alSelErr;

    if (!existingAl) {
      const { error: alInsErr } = await admin.from('alerts').insert({
        import_log_id: logId,
        member_id: mId,
        date: al.date,
        compare: al.compare,
        item: al.item,
        target: al.target,
        actual: al.actual,
        needs_response: al.needs_response,
        response: al.response,
        response_reason: al.response_reason,
        responded_by: al.responderMemberKey ? memberIds[al.responderMemberKey] : null,
        responded_at: al.response ? new Date().toISOString() : null,
      });
      if (alInsErr) throw alInsErr;
    }
  }

  console.log('KPIの架空データ（対応表・取り込みの記録・日々のKPI・月の目標・アラート・設定値）を投入しました。');
}

main().catch((err) => {
  console.error('KPI架空データの投入中にエラーが発生しました:', err?.message ?? err);
  process.exit(1);
});
