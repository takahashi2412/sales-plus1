import {
  countBusinessDaysElapsed,
  getMonthFirstDate,
  getPreviousBusinessDayInMonth,
  isBusinessDay,
  listBusinessDaysInMonth,
} from './businessDays';
import { calculateKpiTargets, resolveTargetValuesAtDate } from './targets';
import type {
  AlertCompare,
  AlertItem,
  KpiEntryRow,
  KpiSlotMetrics,
  KpiTargetRow,
} from './types';

export interface GeneratedAlertDraft {
  import_log_id: string;
  member_id: string;
  date: string;
  compare: AlertCompare;
  item: AlertItem;
  target: number | null;
  actual: number | null;
  needs_response: boolean;
}

export interface EvaluateMemberAlertsInput {
  importLogId: string;
  memberId: string;
  targetDate: string;
  holidays: readonly string[];
  workdays?: readonly string[];
  /** その人のその月の目標（未入力なら null） */
  monthlyTarget: KpiTargetRow | null;
  /** その人のその月の承認済みの日々のKPI（当日の取り込み分を含む、すべて承認済みの行） */
  approvedMonthEntries: Pick<
    KpiEntryRow,
    'date' | 'total' | 'connected' | 'recall' | 'owner' | 'prospect' | 'apo'
  >[];
}

/**
 * 月の目標・基準の日・その月の営業日の一覧から「あるべき」
 * （月の目標 × 基準の日までの営業日の数 ÷ 月の営業日の数）を返す。
 */
export function calculateShouldBe(
  monthlyGoal: number,
  asOfDate: string,
  businessDaysInMonth: readonly string[],
): number {
  const totalBusDays = businessDaysInMonth.length;
  if (totalBusDays <= 0) return 0;
  const elapsedBusDays = countBusinessDaysElapsed(asOfDate, businessDaysInMonth);
  return (monthlyGoal * elapsedBusDays) / totalBusDays;
}

function sumEntriesUpToDate(
  entries: EvaluateMemberAlertsInput['approvedMonthEntries'],
  upToDate: string,
  exactDateOnly = false,
): KpiSlotMetrics {
  const sum: KpiSlotMetrics = {
    total: 0,
    connected: 0,
    recall: 0,
    owner: 0,
    prospect: 0,
    apo: 0,
  };

  for (const e of entries) {
    const match = exactDateOnly ? e.date === upToDate : e.date <= upToDate;
    if (match) {
      sum.total += e.total;
      sum.connected += e.connected;
      sum.recall += e.recall;
      sum.owner += e.owner;
      sum.prospect += e.prospect;
      sum.apo += e.apo;
    }
  }
  return sum;
}

interface PaceItemCheck {
  item: Exclude<AlertItem, 'target_missing'>;
  shouldBe: number;
  actual: number;
  isUnmet: boolean;
}

function evaluatePaceItemsAtDate(
  monthlyTarget: KpiTargetRow,
  approvedMonthEntries: EvaluateMemberAlertsInput['approvedMonthEntries'],
  asOfDate: string,
  businessDaysInMonth: readonly string[],
): Map<Exclude<AlertItem, 'target_missing'>, PaceItemCheck> {
  const elapsedBusDays = countBusinessDaysElapsed(asOfDate, businessDaysInMonth);

  const effectiveValues = resolveTargetValuesAtDate(monthlyTarget, asOfDate);
  const calc = calculateKpiTargets(monthlyTarget.goes_to_sales, effectiveValues);
  const cum = sumEntriesUpToDate(approvedMonthEntries, asOfDate, false);

  const map = new Map<Exclude<AlertItem, 'target_missing'>, PaceItemCheck>();

  const countItems: Array<{
    item: 'total' | 'connected' | 'owner' | 'apo';
    monthlyGoal: number;
    actualVal: number;
  }> = [
    { item: 'total', monthlyGoal: calc.monthlyTotal, actualVal: cum.total },
    { item: 'connected', monthlyGoal: calc.monthlyConnected, actualVal: cum.connected },
    { item: 'owner', monthlyGoal: calc.monthlyOwner, actualVal: cum.owner },
    { item: 'apo', monthlyGoal: calc.monthlyApo, actualVal: cum.apo },
  ];

  for (const ci of countItems) {
    const shouldBe = calculateShouldBe(ci.monthlyGoal, asOfDate, businessDaysInMonth);
    const isUnmet = elapsedBusDays > 0 && ci.actualVal < shouldBe - 1e-9;
    map.set(ci.item, {
      item: ci.item,
      shouldBe,
      actual: ci.actualVal,
      isUnmet,
    });
  }

  // ア/オは率なので、あるべきを使わず、今月ここまでのア÷オと目標の率をそのまま比べる（2026-11-05 本人の選択）
  const apoOwnerTarget = calc.rateApoOwner;
  const apoOwnerActual = cum.owner > 0 ? (cum.apo / cum.owner) * 100 : 0;
  const apoOwnerUnmet =
    elapsedBusDays > 0 && cum.owner > 0 && apoOwnerActual < apoOwnerTarget - 1e-9;

  map.set('apo_owner', {
    item: 'apo_owner',
    shouldBe: apoOwnerTarget,
    actual: apoOwnerActual,
    isUnmet: apoOwnerUnmet,
  });

  return map;
}

export function evaluateMemberAlertsForImport(
  input: EvaluateMemberAlertsInput,
): GeneratedAlertDraft[] {
  const {
    importLogId,
    memberId,
    targetDate,
    holidays,
    workdays = [],
    monthlyTarget,
    approvedMonthEntries,
  } = input;
  const monthFirst = getMonthFirstDate(targetDate);
  const isTargetBusinessDay = isBusinessDay(targetDate, holidays, workdays);

  // 対象の日が営業日でないとき（入れていない土曜と日曜・休みの日）は、
  // 日ごとも月のペースも未達を出さない（目標が未入力の未達も出さない）
  if (!isTargetBusinessDay) {
    return [];
  }

  // 1. 目標が未入力（target_missing）
  if (!monthlyTarget) {
    // その月でその人の承認済みの日々のKPIがはじめて出た営業日だけ needs_response を真にする
    const hasEarlierApprovedDayInMonth = approvedMonthEntries.some(
      (e) =>
        e.date >= monthFirst &&
        e.date < targetDate &&
        isBusinessDay(e.date, holidays, workdays),
    );
    return [
      {
        import_log_id: importLogId,
        member_id: memberId,
        date: targetDate,
        compare: 'daily',
        item: 'target_missing',
        target: null,
        actual: null,
        needs_response: !hasEarlierApprovedDayInMonth,
      },
    ];
  }

  const businessDaysInMonth = listBusinessDaysInMonth(monthFirst, holidays, workdays);
  const dailySum = sumEntriesUpToDate(approvedMonthEntries, targetDate, true);

  const drafts: GeneratedAlertDraft[] = [];

  // 2. 日ごとの未達：対象の日が営業日で、その日の総が1以上の人だけ（総が0の日＝休みの日は日ごとの未達を出さない）
  if (dailySum.total >= 1) {
    const effectiveValues = resolveTargetValuesAtDate(monthlyTarget, targetDate);
    const calc = calculateKpiTargets(monthlyTarget.goes_to_sales, effectiveValues);

    const dailyChecks: Array<{
      item: 'total' | 'connected' | 'owner';
      targetVal: number;
      actualVal: number;
    }> = [
      { item: 'total', targetVal: calc.dailyTotal, actualVal: dailySum.total },
      { item: 'connected', targetVal: calc.dailyConnected, actualVal: dailySum.connected },
      { item: 'owner', targetVal: calc.dailyOwner, actualVal: dailySum.owner },
    ];

    for (const dc of dailyChecks) {
      if (dc.actualVal < dc.targetVal - 1e-9) {
        drafts.push({
          import_log_id: importLogId,
          member_id: memberId,
          date: targetDate,
          compare: 'daily',
          item: dc.item,
          target: dc.targetVal,
          actual: dc.actualVal,
          needs_response: true,
        });
      }
    }

    // ア/オ（日ごと）：オが0の日は判定しない
    if (dailySum.owner >= 1) {
      const actualApoOwner = (dailySum.apo / dailySum.owner) * 100;
      if (actualApoOwner < calc.rateApoOwner - 1e-9) {
        drafts.push({
          import_log_id: importLogId,
          member_id: memberId,
          date: targetDate,
          compare: 'daily',
          item: 'apo_owner',
          target: calc.rateApoOwner,
          actual: actualApoOwner,
          needs_response: true,
        });
      }
    }
  }

  // 3. 月のペースの未達：対象の日が営業日のとき（休んだ分や非営業日にかけた分も月のペースに出る）
  const elapsedBusDays = countBusinessDaysElapsed(targetDate, businessDaysInMonth);
  if (elapsedBusDays >= 1) {
    const todayPaceMap = evaluatePaceItemsAtDate(
      monthlyTarget,
      approvedMonthEntries,
      targetDate,
      businessDaysInMonth,
    );
    const prevBusDay = getPreviousBusinessDayInMonth(targetDate, businessDaysInMonth);
    const prevPaceMap = prevBusDay
      ? evaluatePaceItemsAtDate(
          monthlyTarget,
          approvedMonthEntries,
          prevBusDay,
          businessDaysInMonth,
        )
      : null;

    const paceOrder: Array<Exclude<AlertItem, 'target_missing'>> = [
      'total',
      'connected',
      'owner',
      'apo',
      'apo_owner',
    ];

    for (const itemKey of paceOrder) {
      const check = todayPaceMap.get(itemKey);
      if (!check || !check.isUnmet) continue;

      const wasUnmetOnPrevBusDay = prevPaceMap ? (prevPaceMap.get(itemKey)?.isUnmet ?? false) : false;
      const needsResponse = prevBusDay === null || !wasUnmetOnPrevBusDay;

      drafts.push({
        import_log_id: importLogId,
        member_id: memberId,
        date: targetDate,
        compare: 'pace',
        item: itemKey,
        target: check.shouldBe,
        actual: check.actual,
        needs_response: needsResponse,
      });
    }
  }

  return drafts;
}

export interface AlertsPersistenceError {
  code?: string;
  message?: string;
}

export interface AlertsPersistenceClient {
  from(table: 'alerts'): {
    insert(
      values: GeneratedAlertDraft[],
    ): PromiseLike<{ error: AlertsPersistenceError | null }>;
  };
  from(table: 'import_logs'): {
    update(values: { alerts_created_at: string; alert_count: number }): {
      eq(
        column: 'id',
        value: string,
      ): PromiseLike<{ error: AlertsPersistenceError | null }>;
    };
  };
}

/**
 * 計算した未達（drafts）を alerts に1回の .insert(drafts) でまとめて入れ（.select() なし・upsert 不使用）、
 * 続けて import_logs の alerts_created_at と alert_count を更新する。
 * insert が一意制約違反（code === '23505'）で断られたときは、前に入れ終えていたものとして扱い、
 * 続けて import_logs の更新に進む。それ以外のエラーは止めて投げる。
 */
export async function persistGeneratedAlertsAndMarkImportLog(
  client: AlertsPersistenceClient,
  importLogId: string,
  drafts: GeneratedAlertDraft[],
  nowIso: string = new Date().toISOString(),
): Promise<{ alertCount: number; alreadyExisted: boolean }> {
  let alreadyExisted = false;

  if (drafts.length > 0) {
    const { error: insertAlertsErr } = await client.from('alerts').insert(drafts);
    if (insertAlertsErr) {
      if (insertAlertsErr.code === '23505') {
        alreadyExisted = true;
      } else {
        throw insertAlertsErr;
      }
    }
  }

  const { error: updateLogErr } = await client
    .from('import_logs')
    .update({
      alerts_created_at: nowIso,
      alert_count: drafts.length,
    })
    .eq('id', importLogId);

  if (updateLogErr) {
    throw updateLogErr;
  }

  return {
    alertCount: drafts.length,
    alreadyExisted,
  };
}
