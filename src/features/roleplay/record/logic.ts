import { getTodayJstDateString } from '../../../foundation/directory';
import {
  DEFAULT_ROLEPLAY_SETTINGS,
  type JudgeMark,
  type MemberThemeRow,
  type RoleplayKind,
  type RoleplayRow,
  type RoleplaySettingsMap,
  type RoleplayThemeRow,
  type TalkRow,
  type ViewerContext,
} from '../shared';

export const TIME_SLOT_OPTIONS: { value: string; label: string }[] = [
  { value: '8', label: '8時台' },
  { value: '9', label: '9時台' },
  { value: '10', label: '10時台' },
  { value: '11', label: '11時台' },
  { value: '12', label: '12時台' },
  { value: '13', label: '13時台' },
  { value: '14', label: '14時台' },
  { value: '15', label: '15時台' },
  { value: '16', label: '16時台' },
  { value: '17', label: '17時台' },
  { value: '18', label: '18時台' },
  { value: '19', label: '19時台' },
  { value: '20', label: '20時台' },
  { value: '21', label: '21時台' },
];

export const MINUTES_OPTIONS: { value: string; label: string }[] = [
  { value: '5', label: '5分' },
  { value: '10', label: '10分' },
  { value: '15', label: '15分' },
  { value: '20', label: '20分' },
  { value: '25', label: '25分' },
  { value: '30', label: '30分' },
  { value: '35', label: '35分' },
  { value: '40', label: '40分' },
  { value: '45', label: '45分' },
  { value: '60', label: '60分' },
];

export const REPEAT_COUNT_OPTIONS: { value: string; label: string }[] = [
  { value: '1', label: '1回' },
  { value: '2', label: '2回' },
  { value: '3', label: '3回' },
  { value: '4', label: '4回' },
  { value: '5', label: '5回' },
  { value: '6', label: '6回' },
  { value: '7', label: '7回' },
  { value: '8', label: '8回' },
  { value: '9', label: '9回' },
  { value: '10', label: '10回' },
];

export const HOMEWORK_EXAMPLES: string[] = [
  '返しを録音して聞き直す',
  'アウトへの返しを3つよどみなく言えるようにする',
  '名乗りから用件まで一拍置いて話す練習をする',
  '時間切りの2択を声に出して5回練習する',
  '次の段階の台本を読んでくる',
];

/**
 * 日本時間の今の時間帯（0〜23の数字の文字。例：'9'、'10'、'14'）を返す
 */
export function getCurrentJstTimeSlot(now: Date = new Date()): string {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    hour: 'numeric',
    hour12: false,
  }).format(now);
  const hour = Number(formatted) % 24;
  if (!Number.isFinite(hour)) return '10';
  if (hour < 8) return '8';
  if (hour > 21) return '21';
  return String(hour);
}

/**
 * 時間帯の文字を数値に変える（'9' が '10' より前になるようにする）
 */
export function parseTimeSlotNumber(timeSlot: string): number {
  const num = Number(String(timeSlot).trim());
  return Number.isFinite(num) ? num : 999;
}

/**
 * YYYY-MM-DD に指定した日数を足した YYYY-MM-DD を返す
 */
export function addDaysToDateString(dateStr: string, days: number): string {
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateStr;
  const [, y, m, d] = match;
  const utc = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  utc.setUTCDate(utc.getUTCDate() + days);
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utc.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * startDateStr から endDateStr までの経過日数を返す（end - start）
 */
export function diffDaysBetweenDates(startDateStr: string, endDateStr: string): number {
  const sMatch = startDateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const eMatch = endDateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!sMatch || !eMatch) return 0;
  const sUtc = Date.UTC(Number(sMatch[1]), Number(sMatch[2]) - 1, Number(sMatch[3]));
  const eUtc = Date.UTC(Number(eMatch[1]), Number(eMatch[2]) - 1, Number(eMatch[3]));
  return Math.floor((eUtc - sUtc) / (1000 * 60 * 60 * 24));
}

/**
 * トークのコードを作る：OUT- または SC- ＋ 日付8桁（日本時間）＋ - ＋ UUIDの頭4文字（大文字）
 */
export function generateTalkCode(
  prefix: 'OUT' | 'SC' = 'OUT',
  todayJst: string = getTodayJstDateString(),
  uuidFn: () => string = () => crypto.randomUUID(),
): string {
  const dateDigits = todayJst.replace(/-/g, '').slice(0, 8);
  const head4 = uuidFn().replace(/-/g, '').slice(0, 4).toUpperCase();
  return `${prefix}-${dateDigits}-${head4}`;
}

/**
 * ロープレから新しい言い方を足すときの team_id を決める
 * メンバー・リーダーは自分の今のチーム、MGRと代表は課員の今のチーム（課員にチームがないときは空）
 */
export function resolveNewTalkTeamId(
  viewer: ViewerContext,
  targetMemberTeamId: string | null,
): string | null {
  if (viewer.role === 'member' || viewer.role === 'leader') {
    return viewer.teamId;
  }
  return targetMemberTeamId;
}

const TALK_STATUS_ORDER: Record<string, number> = {
  standard: 1,
  trial: 2,
  pending: 3,
};

/**
 * トークを場面・状態・コードの文字の順で並べる（番号から並べ順を作らない）
 */
export function sortTalksForSelect(
  talks: TalkRow[],
  sceneSortOrderMap: Map<string, number> = new Map(),
): TalkRow[] {
  return [...talks]
    .filter((t) => t.hidden_at === null)
    .sort((a, b) => {
      const sceneA = a.scene_id ? (sceneSortOrderMap.get(a.scene_id) ?? 9999) : 9999;
      const sceneB = b.scene_id ? (sceneSortOrderMap.get(b.scene_id) ?? 9999) : 9999;
      if (sceneA !== sceneB) return sceneA - sceneB;

      const statusA = TALK_STATUS_ORDER[a.status] ?? 99;
      const statusB = TALK_STATUS_ORDER[b.status] ?? 99;
      if (statusA !== statusB) return statusA - statusB;

      return a.code.localeCompare(b.code, 'ja');
    });
}

/**
 * ロープレの記録を時系列（古い順：日付の昇順 → 時間帯の数値の昇順）に比べる
 * '9'（9時台）が '10'（10時台）より前になる
 */
export function compareRoleplaysChronological(a: RoleplayRow, b: RoleplayRow): number {
  const dateCmp = a.date.localeCompare(b.date);
  if (dateCmp !== 0) return dateCmp;

  const slotCmp = parseTimeSlotNumber(a.time_slot) - parseTimeSlotNumber(b.time_slot);
  if (slotCmp !== 0) return slotCmp;

  const subA = a.submitted_at ?? '';
  const subB = b.submitted_at ?? '';
  if (subA !== subB) return subA.localeCompare(subB);

  return a.id.localeCompare(b.id);
}

/**
 * ロープレ一覧の表示順に並べる（日付と時間帯。時間帯は数として並べ、'9' が '10' より前）
 */
export function sortRoleplaysByDateAndTimeSlot(
  rows: RoleplayRow[],
  dateDirection: 'asc' | 'desc' = 'asc',
): RoleplayRow[] {
  return [...rows]
    .filter((r) => r.hidden_at === null)
    .sort((a, b) => {
      const dateCmp =
        dateDirection === 'asc'
          ? a.date.localeCompare(b.date)
          : b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;

      const slotCmp = parseTimeSlotNumber(a.time_slot) - parseTimeSlotNumber(b.time_slot);
      if (slotCmp !== 0) return slotCmp;

      return a.id.localeCompare(b.id);
    });
}

export interface RoleplayFilterCriteria {
  memberId?: string;
  dateFrom?: string;
  dateTo?: string;
  themeId?: string;
}

/**
 * ロープレの一覧を人・期間・テーマで絞り込む
 */
export function filterRoleplays(
  rows: RoleplayRow[],
  criteria: RoleplayFilterCriteria,
): RoleplayRow[] {
  return rows.filter((row) => {
    if (row.hidden_at !== null) return false;
    if (criteria.memberId && row.member_id !== criteria.memberId) return false;
    if (criteria.dateFrom && row.date < criteria.dateFrom) return false;
    if (criteria.dateTo && row.date > criteria.dateTo) return false;
    if (criteria.themeId && row.theme_id !== criteria.themeId) return false;
    return true;
  });
}

/**
 * 課員を選んだとき、または内容（アポ／営業）を切り替えたときの初期テーマと選択肢を決める
 * - preferredKind がないときは、練習中のテーマがあればその内容（アポ優先）、なければアポ
 * - その内容で読める練習中のテーマがあればそのテーマ、なければ is_active が真で同じ内容のテーマ一覧から選ぶ
 */
export function resolveThemeSelectionForMember(
  memberId: string,
  memberThemes: MemberThemeRow[],
  themes: RoleplayThemeRow[],
  preferredKind?: RoleplayKind,
): {
  kind: RoleplayKind;
  themeId: string;
  practicingMemberTheme: MemberThemeRow | null;
  selectableThemes: RoleplayThemeRow[];
} {
  const practicingForMember = memberThemes.filter(
    (mt) => mt.member_id === memberId && mt.status === 'practicing' && mt.hidden_at === null,
  );

  let kind: RoleplayKind = 'apo';
  if (preferredKind) {
    kind = preferredKind;
  } else if (practicingForMember.length > 0) {
    const apoPracticing = practicingForMember.find((mt) => mt.kind === 'apo');
    kind = apoPracticing ? 'apo' : practicingForMember[0].kind;
  }

  const practicingMemberTheme =
    practicingForMember.find((mt) => mt.kind === kind) ?? null;

  const activeThemesOfKind = themes.filter((t) => t.is_active && t.kind === kind);
  const selectableThemes = [...activeThemesOfKind];

  if (practicingMemberTheme) {
    const existsInActive = selectableThemes.some(
      (t) => t.id === practicingMemberTheme.theme_id,
    );
    if (!existsInActive) {
      const practicingThemeRow = themes.find((t) => t.id === practicingMemberTheme.theme_id);
      if (practicingThemeRow) {
        selectableThemes.unshift(practicingThemeRow);
      }
    }
  }

  const themeId = practicingMemberTheme
    ? practicingMemberTheme.theme_id
    : (selectableThemes[0]?.id ?? '');

  return {
    kind,
    themeId,
    practicingMemberTheme,
    selectableThemes,
  };
}

/**
 * 前回の宿題：読める記録のうち、その課員のいちばん新しい送った記録の「次回の宿題」。なければ空文字
 */
export function findPreviousHomework(
  memberId: string,
  roleplays: RoleplayRow[],
  excludeRoleplayId?: string,
): string {
  if (!memberId) return '';
  const submittedForMember = roleplays
    .filter(
      (r) =>
        r.member_id === memberId &&
        r.submitted_at !== null &&
        r.hidden_at === null &&
        r.id !== excludeRoleplayId,
    )
    .sort(compareRoleplaysChronological);

  if (submittedForMember.length === 0) return '';
  const latest = submittedForMember[submittedForMember.length - 1];
  return (latest.next_homework ?? '').trim();
}

/**
 * 書きかけの最初の1行を入れられるか（課員・内容・テーマ・時間帯・日付・実行者がそろっているか）
 */
export function canCreateDraftRoleplay(input: {
  date: string;
  runnerMemberId: string;
  memberId: string;
  timeSlot: string;
  kind: string;
  themeId: string;
}): boolean {
  return Boolean(
    input.date.trim() &&
      input.runnerMemberId.trim() &&
      input.memberId.trim() &&
      input.timeSlot.trim() &&
      input.kind.trim() &&
      input.themeId.trim(),
  );
}

/**
 * 送るとき（submitted_at を入れるとき）の必須項目チェック
 * 今日直した点・時間・合格ラインの○△×の3つ（および基本4項目）がそろっていることを確かめる
 */
export function validateRoleplayForSubmit(input: {
  memberId: string;
  timeSlot: string;
  kind: string;
  themeId: string;
  fixedPoint: string;
  minutes: number | null;
  passResult: JudgeMark | null;
}): { ok: boolean; missingLabels: string[] } {
  const missingLabels: string[] = [];
  if (!input.memberId.trim()) missingLabels.push('課員');
  if (!input.timeSlot.trim()) missingLabels.push('時間帯');
  if (!input.kind.trim()) missingLabels.push('内容');
  if (!input.themeId.trim()) missingLabels.push('テーマ');
  if (input.minutes === null || !Number.isFinite(input.minutes) || input.minutes <= 0) {
    missingLabels.push('時間（分）');
  }
  if (!input.passResult) {
    missingLabels.push('合格ラインの○△×');
  }
  if (!input.fixedPoint.trim()) {
    missingLabels.push('今日直した点');
  }
  return {
    ok: missingLabels.length === 0,
    missingLabels,
  };
}

/**
 * 同じ課員・同じ内容（アポ／営業）で現在練習中のテーマがあるかどうか
 */
export function hasPracticingThemeOfSameKind(
  memberThemes: MemberThemeRow[],
  memberId: string,
  kind: RoleplayKind,
  excludeMemberThemeId?: string,
): boolean {
  return memberThemes.some(
    (mt) =>
      mt.hidden_at === null &&
      mt.status === 'practicing' &&
      mt.member_id === memberId &&
      mt.kind === kind &&
      mt.id !== excludeMemberThemeId,
  );
}

/**
 * 卒業の候補の判定：
 * そのテーマの開始日（started_on）以後の、送った記録（日付・時間帯の順）で、
 * 合格ラインの○が roleplay_graduate_count（初め 2）回続いたら卒業の候補とする
 */
export function evaluateGraduationCandidate(
  memberTheme: MemberThemeRow,
  roleplays: RoleplayRow[],
  graduateCount: number = DEFAULT_ROLEPLAY_SETTINGS.roleplay_graduate_count,
): {
  isCandidate: boolean;
  consecutivePassCount: number;
  totalSubmittedSinceStart: number;
} {
  if (memberTheme.hidden_at !== null || memberTheme.status !== 'practicing') {
    return {
      isCandidate: false,
      consecutivePassCount: 0,
      totalSubmittedSinceStart: 0,
    };
  }

  const targetRecords = roleplays
    .filter(
      (r) =>
        r.hidden_at === null &&
        r.submitted_at !== null &&
        r.member_id === memberTheme.member_id &&
        r.theme_id === memberTheme.theme_id &&
        r.date >= memberTheme.started_on,
    )
    .sort(compareRoleplaysChronological);

  let consecutivePassCount = 0;
  for (const r of targetRecords) {
    if (r.pass_result === 'o') {
      consecutivePassCount += 1;
    } else {
      consecutivePassCount = 0;
    }
  }

  const threshold = graduateCount > 0 ? graduateCount : DEFAULT_ROLEPLAY_SETTINGS.roleplay_graduate_count;
  return {
    isCandidate: consecutivePassCount >= threshold,
    consecutivePassCount,
    totalSubmittedSinceStart: targetRecords.length,
  };
}

/**
 * 卒業にするときの更新値を作る：
 * graduated_on に今日、check_on に今日＋roleplay_check_days（初め 14）日を入れる
 */
export function buildGraduatePatch(
  todayJst: string = getTodayJstDateString(),
  checkDays: number = DEFAULT_ROLEPLAY_SETTINGS.roleplay_check_days,
): {
  status: 'graduated';
  graduated_on: string;
  check_on: string;
} {
  const days = checkDays > 0 ? checkDays : DEFAULT_ROLEPLAY_SETTINGS.roleplay_check_days;
  return {
    status: 'graduated',
    graduated_on: todayJst,
    check_on: addDaysToDateString(todayJst, days),
  };
}

/**
 * 確認のロープレの判定：
 * check_on の日になったら（today >= check_on）知らせる。
 * check_on 以後に、そのテーマで送った記録があれば、知らせを消す。
 */
export function evaluateCheckRoleplayNotice(
  memberTheme: MemberThemeRow,
  roleplays: RoleplayRow[],
  todayJst: string = getTodayJstDateString(),
): {
  needsCheckNotice: boolean;
  latestCheckResult: JudgeMark | null;
  latestCheckDate: string | null;
} {
  if (
    memberTheme.hidden_at !== null ||
    memberTheme.status !== 'graduated' ||
    !memberTheme.check_on
  ) {
    return {
      needsCheckNotice: false,
      latestCheckResult: null,
      latestCheckDate: null,
    };
  }

  const checkRecords = roleplays
    .filter(
      (r) =>
        r.hidden_at === null &&
        r.submitted_at !== null &&
        r.member_id === memberTheme.member_id &&
        r.theme_id === memberTheme.theme_id &&
        r.date >= memberTheme.check_on!,
    )
    .sort(compareRoleplaysChronological);

  if (checkRecords.length > 0) {
    const latest = checkRecords[checkRecords.length - 1];
    return {
      needsCheckNotice: false,
      latestCheckResult: latest.pass_result,
      latestCheckDate: latest.date,
    };
  }

  return {
    needsCheckNotice: todayJst >= memberTheme.check_on,
    latestCheckResult: null,
    latestCheckDate: null,
  };
}

/**
 * 注意1：1回のロープレが roleplay_alert_minutes（初め 30）分を超えたら確認
 */
export function isRoleplayOverAlertMinutes(
  minutes: number | null | undefined,
  alertMinutes: number = DEFAULT_ROLEPLAY_SETTINGS.roleplay_alert_minutes,
): boolean {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return false;
  }
  const threshold = alertMinutes > 0 ? alertMinutes : DEFAULT_ROLEPLAY_SETTINGS.roleplay_alert_minutes;
  return minutes > threshold;
}

/**
 * 注意2：roleplay_alert_days（初め 14）日以上同じテーマが練習中なら注意
 */
export function evaluateLongPracticingAlert(
  memberTheme: MemberThemeRow,
  todayJst: string = getTodayJstDateString(),
  alertDays: number = DEFAULT_ROLEPLAY_SETTINGS.roleplay_alert_days,
): {
  isLongPracticing: boolean;
  practicingDays: number;
} {
  if (memberTheme.hidden_at !== null || memberTheme.status !== 'practicing') {
    return {
      isLongPracticing: false,
      practicingDays: 0,
    };
  }
  const practicingDays = diffDaysBetweenDates(memberTheme.started_on, todayJst);
  const threshold = alertDays > 0 ? alertDays : DEFAULT_ROLEPLAY_SETTINGS.roleplay_alert_days;
  return {
    isLongPracticing: practicingDays >= threshold,
    practicingDays,
  };
}

export interface ThemeNoticeSummaryItem {
  memberTheme: MemberThemeRow;
  consecutivePassCount?: number;
  practicingDays?: number;
}

export interface ThemeNoticesSummary {
  graduationCandidates: ThemeNoticeSummaryItem[];
  checkRoleplayNotices: ThemeNoticeSummaryItem[];
  longPracticingAlerts: ThemeNoticeSummaryItem[];
  overMinutesRoleplays: RoleplayRow[];
}

/**
 * テーマ表の画面の上に出す「卒業の知らせ・確認のロープレ・注意」をまとめて計算する
 */
export function buildThemeNoticesSummary(
  memberThemes: MemberThemeRow[],
  roleplays: RoleplayRow[],
  settings: RoleplaySettingsMap = DEFAULT_ROLEPLAY_SETTINGS,
  todayJst: string = getTodayJstDateString(),
): ThemeNoticesSummary {
  const graduationCandidates: ThemeNoticeSummaryItem[] = [];
  const checkRoleplayNotices: ThemeNoticeSummaryItem[] = [];
  const longPracticingAlerts: ThemeNoticeSummaryItem[] = [];

  for (const mt of memberThemes) {
    if (mt.hidden_at !== null) continue;

    if (mt.status === 'practicing') {
      const grad = evaluateGraduationCandidate(
        mt,
        roleplays,
        settings.roleplay_graduate_count,
      );
      if (grad.isCandidate) {
        graduationCandidates.push({
          memberTheme: mt,
          consecutivePassCount: grad.consecutivePassCount,
        });
      }

      const longPrac = evaluateLongPracticingAlert(
        mt,
        todayJst,
        settings.roleplay_alert_days,
      );
      if (longPrac.isLongPracticing) {
        longPracticingAlerts.push({
          memberTheme: mt,
          practicingDays: longPrac.practicingDays,
        });
      }
    } else if (mt.status === 'graduated') {
      const check = evaluateCheckRoleplayNotice(mt, roleplays, todayJst);
      if (check.needsCheckNotice) {
        checkRoleplayNotices.push({
          memberTheme: mt,
        });
      }
    }
  }

  const overMinutesRoleplays = roleplays.filter(
    (r) =>
      r.hidden_at === null &&
      r.submitted_at !== null &&
      isRoleplayOverAlertMinutes(r.minutes, settings.roleplay_alert_minutes),
  );

  return {
    graduationCandidates,
    checkRoleplayNotices,
    longPracticingAlerts,
    overMinutesRoleplays,
  };
}
