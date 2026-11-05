export interface BusinessDaysContext {
  month: string; // 'YYYY-MM-01'
  holidays: string[]; // 'YYYY-MM-DD'[]
  holidaysConfigured: boolean; // 設定値 kpi_holidays が存在したか
  businessDaysInMonth: string[]; // その月の営業日一覧（昇順）
  totalBusinessDays: number;
}

export function getMonthFirstDate(dateStr: string): string {
  const m = dateStr.trim().match(/^(\d{4})-(\d{2})/);
  if (!m) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return `${m[1]}-${m[2]}-01`;
}

export function isWeekendDate(dateStr: string): boolean {
  const m = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

export function isBusinessDay(dateStr: string, holidays: readonly string[]): boolean {
  if (isWeekendDate(dateStr)) return false;
  if (holidays.includes(dateStr)) return false;
  return true;
}

export function listBusinessDaysInMonth(
  yearMonthOrDate: string,
  holidays: readonly string[],
): string[] {
  const m = yearMonthOrDate.trim().match(/^(\d{4})-(\d{2})/);
  if (!m) {
    return [];
  }
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const holidaySet = new Set(holidays);
  const result: string[] = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${m[1]}-${m[2]}-${String(day).padStart(2, '0')}`;
    if (!isWeekendDate(iso) && !holidaySet.has(iso)) {
      result.push(iso);
    }
  }
  return result;
}

export function buildBusinessDaysContext(
  yearMonthOrDate: string,
  holidaysSettingValue: readonly string[] | null | undefined,
): BusinessDaysContext {
  const month = getMonthFirstDate(yearMonthOrDate);
  const holidaysConfigured = Array.isArray(holidaysSettingValue);
  const holidays = holidaysConfigured
    ? holidaysSettingValue.filter((v): v is string => typeof v === 'string')
    : [];
  const businessDaysInMonth = listBusinessDaysInMonth(month, holidays);

  return {
    month,
    holidays,
    holidaysConfigured,
    businessDaysInMonth,
    totalBusinessDays: businessDaysInMonth.length,
  };
}

/**
 * その月の1日から targetDate（当日を含む）までの営業日の数を返す
 */
export function countBusinessDaysElapsed(
  targetDate: string,
  businessDaysInMonth: readonly string[],
): number {
  return businessDaysInMonth.filter((d) => d <= targetDate).length;
}

/**
 * その月の中で、targetDate より前の直近の営業日を返す（targetDate がその月の最初の営業日またはそれより前なら null）
 */
export function getPreviousBusinessDayInMonth(
  targetDate: string,
  businessDaysInMonth: readonly string[],
): string | null {
  const prev = businessDaysInMonth.filter((d) => d < targetDate);
  return prev.length > 0 ? prev[prev.length - 1] : null;
}
