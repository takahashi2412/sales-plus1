import type { KpiTargetHistoryItem, KpiTargetRow, KpiTargetValues } from './types';

export interface CalculatedKpiTargets {
  goesToSales: boolean;
  // 行動の目標（日次）
  dailyTotal: number;
  dailyConnected: number;
  dailyRecall: number;
  dailyOwner: number;
  dailyProspect: number;
  // 行動の目標（月次）
  monthlyTotal: number;
  monthlyConnected: number;
  monthlyRecall: number;
  monthlyOwner: number;
  monthlyProspect: number;
  // 率の目標
  rateApoOwner: number;
  // 成果の目標（月次）
  deals: number | null; // 件数（目標粗利÷単価）
  ordersKgi: number | null; // 受注（KGI）＝件数÷完了率
  adoptions: number; // 採用・訪問（出る人＝受注÷受注率、出ない人＝ア×採用率）
  monthlyApo: number; // ア（月次）（出る人＝採用・訪問÷採用率、出ない人＝apo_target）
  // 行動から出るアポ数（月次）＝総（月次）×オ率×ア/オ
  actionMonthlyApo: number;
  // ア（月次）と「総×オ率×ア/オから出るアポ数（月次）」が離れているか（小数第1位で丸めた値で比較）
  apoMismatch: boolean;
  apoDiff: number; // actionMonthlyApo - monthlyApo
}

export function calculateKpiTargets(
  goesToSales: boolean,
  values: KpiTargetValues,
): CalculatedKpiTargets {
  const dailyTotal = values.call_hours * values.term;
  const monthlyTotal = dailyTotal * values.working_days;

  const dailyConnected = dailyTotal * (values.rate_connected / 100);
  const dailyRecall = dailyTotal * (values.rate_recall / 100);
  const dailyOwner = dailyTotal * (values.rate_owner / 100);
  const dailyProspect = dailyTotal * (values.rate_prospect / 100);

  const monthlyConnected = monthlyTotal * (values.rate_connected / 100);
  const monthlyRecall = monthlyTotal * (values.rate_recall / 100);
  const monthlyOwner = monthlyTotal * (values.rate_owner / 100);
  const monthlyProspect = monthlyTotal * (values.rate_prospect / 100);

  const rateApoOwner = values.rate_apo_owner;

  let deals: number | null = null;
  let ordersKgi: number | null = null;
  let adoptions = 0;
  let monthlyApo = 0;

  if (goesToSales) {
    const profit = values.target_profit ?? 0;
    const unitPrice = values.unit_price ?? 0;
    const completionRate = values.completion_rate ?? 0;
    const rateOrder = values.rate_order ?? 0;
    const rateAdoption = values.rate_adoption;

    deals = unitPrice > 0 ? profit / unitPrice : 0;
    ordersKgi = completionRate > 0 ? deals / (completionRate / 100) : 0;
    adoptions = rateOrder > 0 ? ordersKgi / (rateOrder / 100) : 0;
    monthlyApo = rateAdoption > 0 ? adoptions / (rateAdoption / 100) : 0;
  } else {
    monthlyApo = values.apo_target ?? 0;
    adoptions = monthlyApo * (values.rate_adoption / 100);
  }

  const actionMonthlyApo =
    monthlyTotal * (values.rate_owner / 100) * (values.rate_apo_owner / 100);

  const apoDiff = actionMonthlyApo - monthlyApo;
  // 画面表示（小数第1位）で差があるかどうかで不一致を判定（浮動小数点の微小誤差 1e-6 は吸収）
  const apoMismatch = Math.abs(Math.round(actionMonthlyApo * 10) - Math.round(monthlyApo * 10)) > 0;

  return {
    goesToSales,
    dailyTotal,
    dailyConnected,
    dailyRecall,
    dailyOwner,
    dailyProspect,
    monthlyTotal,
    monthlyConnected,
    monthlyRecall,
    monthlyOwner,
    monthlyProspect,
    rateApoOwner,
    deals,
    ordersKgi,
    adoptions,
    monthlyApo,
    actionMonthlyApo,
    apoMismatch,
    apoDiff,
  };
}

export function formatDecimal1(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '－';
  }
  const rounded = Math.round(value * 10) / 10;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  return rounded.toFixed(1);
}

/**
 * 対象の日の終わりの時点で効いていた目標値を返す。
 * `changed_at` が対象の日（JST 23:59:59.999）より後の控えがあれば、
 * そのうちいちばん古い控えの `values` を返し、なければ現在の値を返す。
 */
export function resolveTargetValuesAtDate(
  target: Pick<KpiTargetRow, keyof KpiTargetValues | 'history'>,
  targetDate: string,
): KpiTargetValues {
  const endOfTargetDayMs = Date.parse(`${targetDate}T23:59:59.999+09:00`);
  const historyList: KpiTargetHistoryItem[] = Array.isArray(target.history) ? target.history : [];

  const afterEntries = historyList
    .map((item) => ({
      item,
      ms: Date.parse(item.changed_at),
    }))
    .filter((entry) => !Number.isNaN(entry.ms) && entry.ms > endOfTargetDayMs)
    .sort((a, b) => a.ms - b.ms);

  if (afterEntries.length > 0) {
    const oldestValues = afterEntries[0].item.values;
    return {
      target_profit:
        oldestValues.target_profit !== null && oldestValues.target_profit !== undefined
          ? Number(oldestValues.target_profit)
          : null,
      unit_price:
        oldestValues.unit_price !== null && oldestValues.unit_price !== undefined
          ? Number(oldestValues.unit_price)
          : null,
      completion_rate:
        oldestValues.completion_rate !== null && oldestValues.completion_rate !== undefined
          ? Number(oldestValues.completion_rate)
          : null,
      rate_order:
        oldestValues.rate_order !== null && oldestValues.rate_order !== undefined
          ? Number(oldestValues.rate_order)
          : null,
      apo_target:
        oldestValues.apo_target !== null && oldestValues.apo_target !== undefined
          ? Number(oldestValues.apo_target)
          : null,
      working_days: Number(oldestValues.working_days),
      call_hours: Number(oldestValues.call_hours),
      term: Number(oldestValues.term),
      rate_connected: Number(oldestValues.rate_connected),
      rate_recall: Number(oldestValues.rate_recall),
      rate_owner: Number(oldestValues.rate_owner),
      rate_prospect: Number(oldestValues.rate_prospect),
      rate_apo_owner: Number(oldestValues.rate_apo_owner),
      rate_adoption: Number(oldestValues.rate_adoption),
    };
  }

  return {
    target_profit:
      target.target_profit !== null && target.target_profit !== undefined
        ? Number(target.target_profit)
        : null,
    unit_price:
      target.unit_price !== null && target.unit_price !== undefined
        ? Number(target.unit_price)
        : null,
    completion_rate:
      target.completion_rate !== null && target.completion_rate !== undefined
        ? Number(target.completion_rate)
        : null,
    rate_order:
      target.rate_order !== null && target.rate_order !== undefined
        ? Number(target.rate_order)
        : null,
    apo_target:
      target.apo_target !== null && target.apo_target !== undefined
        ? Number(target.apo_target)
        : null,
    working_days: Number(target.working_days),
    call_hours: Number(target.call_hours),
    term: Number(target.term),
    rate_connected: Number(target.rate_connected),
    rate_recall: Number(target.rate_recall),
    rate_owner: Number(target.rate_owner),
    rate_prospect: Number(target.rate_prospect),
    rate_apo_owner: Number(target.rate_apo_owner),
    rate_adoption: Number(target.rate_adoption),
  };
}
