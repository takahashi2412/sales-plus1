export type MasterKind = 'scene' | 'industry' | 'list_type';

export interface MasterRow {
  id: string;
  kind: MasterKind;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export type RoleplaySettingKey =
  | 'roleplay_alert_minutes'
  | 'roleplay_alert_days'
  | 'roleplay_graduate_count'
  | 'roleplay_check_days';

export interface SettingRow {
  key: string;
  value: unknown;
  reason: string;
  updated_by: string | null;
  updated_at: string;
}

export interface RoleplaySettingsMap {
  roleplay_alert_minutes: number;
  roleplay_alert_days: number;
  roleplay_graduate_count: number;
  roleplay_check_days: number;
}

export type AuditAction = 'insert' | 'update' | 'delete';

export interface AuditLogRow {
  id: string;
  actor_member_id: string | null;
  action: AuditAction;
  table_name: string;
  row_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

export type RoleplayKind = 'apo' | 'sales';

export type JudgeMark = 'o' | 'd' | 'x';

export interface RoleplayThemeRow {
  id: string;
  no: number;
  stage: number;
  name: string;
  kind: RoleplayKind;
  pass_example: string;
  is_active: boolean;
}

export type MemberThemeStatus = 'practicing' | 'graduated';

export interface MemberThemeRow {
  id: string;
  member_id: string;
  theme_id: string;
  kind: RoleplayKind;
  started_on: string;
  pass_line: string;
  status: MemberThemeStatus;
  graduated_on: string | null;
  check_on: string | null;
  created_by: string;
  hidden_at: string | null;
}

export interface RoleplayRow {
  id: string;
  date: string;
  runner_member_id: string;
  member_id: string;
  time_slot: string;
  kind: RoleplayKind;
  theme_id: string;
  used_talk_id: string | null;
  minutes: number | null;
  homework_result: JudgeMark | null;
  repeat_count: number;
  pass_result: JudgeMark | null;
  next_homework: string | null;
  fixed_point: string;
  note: string | null;
  purpose: string | null;
  result_ap: number | null;
  result_rate: number | null;
  submitted_at: string | null;
  hidden_at: string | null;
}

export type TalkStatus = 'pending' | 'trial' | 'standard';

export interface TalkRow {
  id: string;
  code: string;
  scene_id: string | null;
  industry_id: string | null;
  list_type_id: string | null;
  their_words: string;
  wording: string;
  aim: string;
  team_id: string | null;
  created_by: string;
  status: TalkStatus;
  hidden_at: string | null;
}

export interface SeminarRow {
  id: string;
  date: string;
  theme: string;
  lecturer: string;
  minutes: number;
  content: string;
  created_by: string;
  hidden_at: string | null;
}

export interface SeminarMemberRow {
  seminar_id: string;
  member_id: string;
  removed_at: string | null;
}

export const ROLEPLAY_KIND_LABELS: Record<RoleplayKind, string> = {
  apo: 'アポ',
  sales: '営業',
};

export const JUDGE_MARK_LABELS: Record<JudgeMark, string> = {
  o: '○',
  d: '△',
  x: '×',
};

export const MEMBER_THEME_STATUS_LABELS: Record<MemberThemeStatus, string> = {
  practicing: '練習中',
  graduated: '卒業',
};

export const TALK_STATUS_LABELS: Record<TalkStatus, string> = {
  pending: '確認待ち',
  trial: '試行中',
  standard: '標準',
};
