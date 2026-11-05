export const KPI_TIME_SLOTS = [
  '0_8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21_23',
] as const;

export type KpiTimeSlot = (typeof KPI_TIME_SLOTS)[number];

export const CSV_TIME_SLOT_HEADERS: Record<KpiTimeSlot, string> = {
  '0_8': '0:00〜8:59',
  '9': '9:00',
  '10': '10:00',
  '11': '11:00',
  '12': '12:00',
  '13': '13:00',
  '14': '14:00',
  '15': '15:00',
  '16': '16:00',
  '17': '17:00',
  '18': '18:00',
  '19': '19:00',
  '20': '20:00',
  '21_23': '21:00〜23:59',
};

export const CSV_METRIC_KEYS = ['total', 'connected', 'recall', 'owner', 'prospect', 'apo'] as const;
export type CsvMetricKey = (typeof CSV_METRIC_KEYS)[number];

export const CSV_METRIC_LABELS: Record<CsvMetricKey, string> = {
  total: '総',
  connected: '実',
  recall: '再',
  owner: 'オ',
  prospect: '見',
  apo: 'ア',
};

export interface KpiSlotMetrics {
  total: number;
  connected: number;
  recall: number;
  owner: number;
  prospect: number;
  apo: number;
}

export interface CtiTeamMapRow {
  id: string;
  csv_team_name: string;
  team_id: string;
  valid_from: string;
  valid_to: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CtiMemberMapRow {
  id: string;
  cti_name: string;
  member_id: string | null;
  valid_from: string;
  valid_to: string | null;
  created_by: string | null;
  created_at: string;
}

export type ImportLogStatus = 'pending' | 'approved' | 'replaced';

export interface ImportLogRow {
  id: string;
  target_date: string;
  csv_team_name: string;
  team_id: string | null;
  file_name: string;
  row_count: number;
  error_count: number;
  totals_match: boolean;
  notes: unknown;
  status: ImportLogStatus;
  imported_by: string;
  imported_at: string;
  approved_by: string | null;
  approved_at: string | null;
  approval_kind: 'manual' | 'auto' | null;
  replaced_at: string | null;
  alerts_created_at: string | null;
  alert_count: number | null;
}

export interface KpiEntryRow {
  id: string;
  import_log_id: string;
  member_id: string;
  date: string;
  time_slot: KpiTimeSlot;
  total: number;
  connected: number;
  recall: number;
  owner: number;
  prospect: number;
  apo: number;
}

export interface KpiTargetValues {
  target_profit: number | null;
  unit_price: number | null;
  completion_rate: number | null;
  rate_order: number | null;
  apo_target: number | null;
  working_days: number;
  call_hours: number;
  term: number;
  rate_connected: number;
  rate_recall: number;
  rate_owner: number;
  rate_prospect: number;
  rate_apo_owner: number;
  rate_adoption: number;
}

export interface KpiTargetHistoryItem {
  changed_at: string;
  values: KpiTargetValues;
}

export interface KpiTargetRow extends KpiTargetValues {
  id: string;
  member_id: string;
  month: string;
  goes_to_sales: boolean;
  history: KpiTargetHistoryItem[];
  revised_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AlertCompare = 'daily' | 'pace';
export type AlertItem = 'total' | 'connected' | 'owner' | 'apo_owner' | 'apo' | 'target_missing';
export type AlertResponseStatus = 'done' | 'unneeded';

export interface AlertRow {
  id: string;
  import_log_id: string;
  member_id: string;
  date: string;
  compare: AlertCompare;
  item: AlertItem;
  target: number | null;
  actual: number | null;
  needs_response: boolean;
  response: AlertResponseStatus | null;
  response_reason: string | null;
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
}

/**
 * Supabase のエラー（PostgrestError など Error のインスタンスでないオブジェクト）からも
 * message を取り出し、「決まった文（理由：…）」の形で返す。
 */
export function formatKpiErrorMessage(fallback: string, err: unknown): string {
  if (!err) return fallback;
  if (typeof err === 'string' && err.trim().length > 0) {
    const trimmed = err.trim();
    return trimmed === fallback ? fallback : `${fallback}（理由：${trimmed}）`;
  }
  if (typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim().length > 0) {
      const trimmed = msg.trim();
      return trimmed === fallback ? fallback : `${fallback}（理由：${trimmed}）`;
    }
  }
  return fallback;
}
