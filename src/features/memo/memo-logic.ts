import type { SupabaseClient } from '@supabase/supabase-js';
import { getTodayJstDateString } from '../../foundation/directory';
import { supabase } from '../../foundation/supabaseClient';
import type {
  MemberAffiliationRow,
  MemberRole,
  MemberRow,
  TeamRow,
} from '../../foundation/types';
import {
  canSuperviseMember,
  fetchViewerContext,
  resolveCurrentTeamId,
  type ViewerContext,
} from '../../foundation/viewer';

// --- 型定義 ---

export type MemoCheckValue = 'o' | 'd' | 'x';

export interface MemoMasterRow {
  id: string;
  kind: 'memo_theme' | 'memo_kind';
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface SubordinateMemoRow {
  id: string;
  date: string;
  created_by: string;
  theme_id: string | null;
  kind_id: string | null;
  noticed: string;
  guidance: string;
  next_check_on: string | null;
  action_check: MemoCheckValue | null;
  result_check: MemoCheckValue | null;
  checked_on: string | null;
  training_id: string | null;
  is_legacy: boolean;
  legacy_source: unknown;
  submitted_at: string | null;
  hidden_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubordinateMemoTargetRow {
  memo_id: string;
  member_id: string;
  removed_at: string | null;
}

export interface SupervisableTargetOption {
  id: string;
  name: string;
  role: MemberRole;
  teamId: string | null;
  teamName: string;
}

export interface ReadableMemberInfo {
  id: string;
  name: string;
  role: MemberRole;
  teamId: string | null;
  teamName: string;
}

export interface MemoFilterInput {
  targetMemberId?: string;
  themeId?: string;
  kindId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface MemoValidationResult {
  ok: boolean;
  missingLabels: string[];
}

export interface TargetSelectionEligibility {
  selectableOptions: SupervisableTargetOption[];
  selectedOptions: SupervisableTargetOption[];
  lockedTeamId: string | null;
  isTeamlessSelected: boolean;
  hasLeaderAndMemberCombined: boolean;
}

// --- 表示用のラベル変換・フォーマット ---

export const MEMO_CHECK_LABELS: Record<MemoCheckValue, string> = {
  o: '○',
  d: '△',
  x: '×',
};

export function formatMemoCheckLabel(value: MemoCheckValue | null | undefined): string {
  if (!value) return '－';
  return MEMO_CHECK_LABELS[value] ?? '－';
}

/**
 * 送ったあとに直したメモかどうかを判定し、「〇月〇日に直した」の文字列を返す（直していなければ null）
 * 送った瞬間（submitted_at と updated_at の差が2秒以内）は「送った」操作そのものなので「直した」とは出さない。
 */
export function formatUpdatedAfterSubmitLabel(
  submittedAt: string | null | undefined,
  updatedAt: string | null | undefined,
): string | null {
  if (!submittedAt || !updatedAt) return null;
  const subTime = Date.parse(submittedAt);
  const updTime = Date.parse(updatedAt);
  if (Number.isNaN(subTime) || Number.isNaN(updTime)) return null;
  if (updTime - subTime <= 2000) return null;

  const jstStr = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(updTime));

  const match = jstStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  return `${month}月${day}日に直した`;
}

/**
 * 一覧用の本文プレビュー（頭の部分）を作る
 */
export function truncateMemoSnippet(text: string | null | undefined, maxLength = 36): string {
  const cleaned = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '－';
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength)}…`;
}

/**
 * 書いた人の表示名を返す。リーダーはMGR・代表の名簿の行を読めないので、読めないときは「ほかの上席」と出す。
 */
export function formatMemoWriterName(
  createdBy: string,
  viewerMemberId: string,
  readableMembers: Map<string, ReadableMemberInfo>,
): string {
  if (createdBy === viewerMemberId) {
    return readableMembers.get(createdBy)?.name ?? '自分';
  }
  const found = readableMembers.get(createdBy);
  return found ? found.name : 'ほかの上席';
}

/**
 * 対象者（removed_at が空の行）の member_id 一覧を返す
 */
export function getActiveTargetMemberIds(
  memoId: string,
  targetRows: SubordinateMemoTargetRow[],
): string[] {
  return targetRows
    .filter((t) => t.memo_id === memoId && t.removed_at === null)
    .map((t) => t.member_id);
}

/**
 * 対象者の名前の一覧を返す（読めない場合は「ほかのチームの人」とする）
 */
export function formatMemoTargetNames(
  memoId: string,
  targetRows: SubordinateMemoTargetRow[],
  readableMembers: Map<string, ReadableMemberInfo>,
): string {
  const ids = getActiveTargetMemberIds(memoId, targetRows);
  if (ids.length === 0) return '未選択';
  return ids
    .map((id) => readableMembers.get(id)?.name ?? 'ほかのチームの人')
    .join('・');
}

// --- 2-3 計算の部品（画面やデータベースに頼らない純粋関数） ---

/**
 * 一覧（masters）から指定した kind で is_active が真のものを sort_order 順に取り出す
 */
export function pickActiveMemoMasters(
  masters: MemoMasterRow[],
  kind: 'memo_theme' | 'memo_kind',
): MemoMasterRow[] {
  return masters
    .filter((m) => m.kind === kind && m.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * 読める名簿の行と所属履歴・チームから、メンバー情報のマップを作る
 */
export function buildReadableMemberMap(
  members: MemberRow[],
  affiliations: MemberAffiliationRow[],
  teams: TeamRow[],
  today: string = getTodayJstDateString(),
): Map<string, ReadableMemberInfo> {
  const teamNameById = new Map<string, string>(teams.map((t) => [t.id, t.name]));
  const result = new Map<string, ReadableMemberInfo>();

  for (const m of members) {
    const teamId = resolveCurrentTeamId(m.id, affiliations, today);
    const teamName =
      teamId === null ? 'チームなし' : (teamNameById.get(teamId) ?? 'ほかのチーム');
    result.set(m.id, {
      id: m.id,
      name: m.name,
      role: m.role,
      teamId,
      teamName,
    });
  }

  return result;
}

/**
 * 確認待ちの選び出し：
 * - 自分が書いたメモ（created_by === viewerMemberId）
 * - 送ったもの（submitted_at !== null）
 * - 見えなくしていないもの（hidden_at === null）
 * - 次の確認日（next_check_on）が空でなく、今日（日本時間）以前（next_check_on <= today）
 * - 行動（action_check）がまだ空のもの（action_check === null）
 * 並び順は次の確認日が古い順（同じなら日付の新しい順）
 */
export function pickPendingCheckMemos(
  memos: SubordinateMemoRow[],
  viewerMemberId: string,
  today: string = getTodayJstDateString(),
): SubordinateMemoRow[] {
  return memos
    .filter(
      (m) =>
        !m.is_legacy &&
        m.created_by === viewerMemberId &&
        m.submitted_at !== null &&
        m.hidden_at === null &&
        m.next_check_on !== null &&
        m.next_check_on <= today &&
        m.action_check === null,
    )
    .sort((a, b) => {
      const cmpCheck = (a.next_check_on ?? '').localeCompare(b.next_check_on ?? '');
      if (cmpCheck !== 0) return cmpCheck;
      return b.date.localeCompare(a.date);
    });
}

/**
 * 自分の書きかけのメモ（submitted_at が空・見えなくしていないもの）を新しい順に取り出す
 */
export function pickMyDraftMemos(
  memos: SubordinateMemoRow[],
  viewerMemberId: string,
): SubordinateMemoRow[] {
  return memos
    .filter(
      (m) =>
        !m.is_legacy &&
        m.created_by === viewerMemberId &&
        m.submitted_at === null &&
        m.hidden_at === null,
    )
    .sort((a, b) => {
      const cmpDate = b.date.localeCompare(a.date);
      if (cmpDate !== 0) return cmpDate;
      return b.updated_at.localeCompare(a.updated_at);
    });
}

/**
 * 一覧に出す送ったメモ（submitted_at あり・hidden_at が空）を新しい日が上に並べ、絞り込む
 */
export function filterAndSortSubmittedMemos(
  memos: SubordinateMemoRow[],
  targetRows: SubordinateMemoTargetRow[],
  filter: MemoFilterInput = {},
): SubordinateMemoRow[] {
  const activeTargetsByMemo = new Map<string, Set<string>>();
  for (const t of targetRows) {
    if (t.removed_at !== null) continue;
    let set = activeTargetsByMemo.get(t.memo_id);
    if (!set) {
      set = new Set<string>();
      activeTargetsByMemo.set(t.memo_id, set);
    }
    set.add(t.member_id);
  }

  return memos
    .filter((m) => {
      if (m.submitted_at === null || m.hidden_at !== null) return false;
      if (filter.themeId && m.theme_id !== filter.themeId) return false;
      if (filter.kindId && m.kind_id !== filter.kindId) return false;
      if (filter.dateFrom && m.date < filter.dateFrom) return false;
      if (filter.dateTo && m.date > filter.dateTo) return false;
      if (filter.targetMemberId) {
        const targets = activeTargetsByMemo.get(m.id);
        if (!targets || !targets.has(filter.targetMemberId)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const cmpDate = b.date.localeCompare(a.date);
      if (cmpDate !== 0) return cmpDate;
      return (b.submitted_at ?? '').localeCompare(a.submitted_at ?? '');
    });
}

/**
 * 対象者の選べる人（1人目の候補）：
 * - ログインしている人が上席として見ている人（canSuperviseMember が真）
 * - 自分と、退職日を過ぎた人（retired_on < today）は除く
 */
export function pickSupervisableTargetOptions(
  viewer: ViewerContext,
  members: MemberRow[],
  affiliations: MemberAffiliationRow[],
  teams: TeamRow[],
  today: string = getTodayJstDateString(),
): SupervisableTargetOption[] {
  const teamNameById = new Map<string, string>(teams.map((t) => [t.id, t.name]));

  return members
    .filter((m) => {
      if (m.id === viewer.memberId) return false;
      if (m.retired_on !== null && m.retired_on < today) return false;
      const teamId = resolveCurrentTeamId(m.id, affiliations, today);
      return canSuperviseMember(viewer, { id: m.id, teamId });
    })
    .map((m) => {
      const teamId = resolveCurrentTeamId(m.id, affiliations, today);
      const teamName =
        teamId === null ? 'チームなし' : (teamNameById.get(teamId) ?? 'ほかのチーム');
      return {
        id: m.id,
        name: m.name,
        role: m.role,
        teamId,
        teamName,
      };
    })
    .sort((a, b) => {
      const teamCmp = a.teamName.localeCompare(b.teamName, 'ja');
      if (teamCmp !== 0) return teamCmp;
      return a.name.localeCompare(b.name, 'ja');
    });
}

/**
 * 対象者の選び方（同じチームでの絞り込みと、リーダー＋メンバー同時選択の判定）：
 * - 1人目を選んだら、2人目からはその人と今同じチームの人だけを出す
 * - チームがない人（teamId === null）を選んだときは、ほかの人を足せない（その1人だけ）
 * - リーダー（role === 'leader'）とメンバー（role === 'member'）が一緒に対象に入っているかを判定する
 */
export function filterSelectableTargetsBySelected(
  allSupervisableOptions: SupervisableTargetOption[],
  selectedMemberIds: string[],
): TargetSelectionEligibility {
  const optionMap = new Map<string, SupervisableTargetOption>(
    allSupervisableOptions.map((o) => [o.id, o]),
  );
  const selectedOptions = selectedMemberIds
    .map((id) => optionMap.get(id))
    .filter((o): o is SupervisableTargetOption => Boolean(o));

  if (selectedOptions.length === 0) {
    return {
      selectableOptions: allSupervisableOptions,
      selectedOptions: [],
      lockedTeamId: null,
      isTeamlessSelected: false,
      hasLeaderAndMemberCombined: false,
    };
  }

  const first = selectedOptions[0];
  const isTeamlessSelected = first.teamId === null;
  const lockedTeamId = first.teamId;

  const selectableOptions = isTeamlessSelected
    ? [first]
    : allSupervisableOptions.filter((o) => o.teamId !== null && o.teamId === lockedTeamId);

  const hasLeader = selectedOptions.some((o) => o.role === 'leader');
  const hasMember = selectedOptions.some((o) => o.role === 'member');

  return {
    selectableOptions,
    selectedOptions,
    lockedTeamId,
    isTeamlessSelected,
    hasLeaderAndMemberCombined: hasLeader && hasMember,
  };
}

/**
 * 送る前の確かめ（必須の欄）：
 * - 日付（date）
 * - 対象者（1人以上）
 * - テーマ（themeId）
 * - 種類（kindId）
 * - 気づいた内容（noticed）か指導した内容（guidance）のどちらか（空白だけでない）
 */
export function validateMemoForSubmit(input: {
  date: string;
  targetMemberIds: string[];
  themeId: string | null;
  kindId: string | null;
  noticed: string;
  guidance: string;
}): MemoValidationResult {
  const missingLabels: string[] = [];

  if (!input.date || !input.date.trim()) {
    missingLabels.push('日付');
  }
  if (!input.targetMemberIds || input.targetMemberIds.length === 0) {
    missingLabels.push('対象者');
  }
  if (!input.themeId) {
    missingLabels.push('テーマ');
  }
  if (!input.kindId) {
    missingLabels.push('種類');
  }
  const hasNoticed = Boolean(input.noticed && input.noticed.trim().length > 0);
  const hasGuidance = Boolean(input.guidance && input.guidance.trim().length > 0);
  if (!hasNoticed && !hasGuidance) {
    missingLabels.push('気づいた内容または指導した内容');
  }

  return {
    ok: missingLabels.length === 0,
    missingLabels,
  };
}

/**
 * 既存の sub_memo_targets 行と、新しく選ばれた member_id の一覧を比べて、
 * - 追加する member_id（まだ行がない人）
 * - 戻す member_id（removed_at が入っていた行を null に戻す人）
 * - 外す member_id（removed_at が空だった行に removed_at を入れる人）
 * に分ける。外した人を戻すときは行を足し直さず removed_at を空に戻す。
 */
export function planMemoTargetChanges(
  existingTargetRowsForMemo: SubordinateMemoTargetRow[],
  nextTargetMemberIds: string[],
  isSubmittedMemo: boolean,
): {
  toInsert: string[];
  toRestore: string[];
  toRemove: string[];
} {
  const nextSet = new Set(nextTargetMemberIds);
  // 送ったメモの対象者を全員外す操作は出さない（最後の1人は外せない）
  if (isSubmittedMemo && nextSet.size === 0) {
    throw new Error('送ったメモの対象者を全員外すことはできません。');
  }

  const existingByMember = new Map<string, SubordinateMemoTargetRow>();
  for (const row of existingTargetRowsForMemo) {
    existingByMember.set(row.member_id, row);
  }

  const toInsert: string[] = [];
  const toRestore: string[] = [];
  const toRemove: string[] = [];

  for (const memberId of nextSet) {
    const existing = existingByMember.get(memberId);
    if (!existing) {
      toInsert.push(memberId);
    } else if (existing.removed_at !== null) {
      toRestore.push(memberId);
    }
  }

  for (const [memberId, existing] of existingByMember.entries()) {
    if (existing.removed_at === null && !nextSet.has(memberId)) {
      toRemove.push(memberId);
    }
  }

  return { toInsert, toRestore, toRemove };
}

// --- Supabase データ取得・保存関数 ---

export interface MemoPageDataset {
  viewer: ViewerContext;
  memos: SubordinateMemoRow[];
  targetRows: SubordinateMemoTargetRow[];
  masters: MemoMasterRow[];
  members: MemberRow[];
  affiliations: MemberAffiliationRow[];
  teams: TeamRow[];
}

export async function fetchMemoPageDataset(
  client: SupabaseClient = supabase,
): Promise<MemoPageDataset | null> {
  const viewer = await fetchViewerContext(client);
  if (!viewer) return null;

  const [memosRes, targetsRes, mastersRes, membersRes, affRes, teamsRes] = await Promise.all([
    client.from('subordinate_memos').select('*').order('date', { ascending: false }),
    client.from('subordinate_memo_targets').select('*'),
    client
      .from('masters')
      .select('*')
      .in('kind', ['memo_theme', 'memo_kind'])
      .order('sort_order', { ascending: true }),
    client.from('members').select('*'),
    client.from('member_affiliations').select('*'),
    client.from('teams').select('*'),
  ]);

  if (memosRes.error) throw memosRes.error;
  if (targetsRes.error) throw targetsRes.error;
  if (mastersRes.error) throw mastersRes.error;
  if (membersRes.error) throw membersRes.error;
  if (affRes.error) throw affRes.error;
  if (teamsRes.error) throw teamsRes.error;

  return {
    viewer,
    memos: (memosRes.data ?? []) as SubordinateMemoRow[],
    targetRows: (targetsRes.data ?? []) as SubordinateMemoTargetRow[],
    masters: (mastersRes.data ?? []) as MemoMasterRow[],
    members: (membersRes.data ?? []) as MemberRow[],
    affiliations: (affRes.data ?? []) as MemberAffiliationRow[],
    teams: (teamsRes.data ?? []) as TeamRow[],
  };
}

export async function insertDraftMemoRow(
  input: {
    date: string;
    created_by: string;
    theme_id: string | null;
    kind_id: string | null;
    noticed: string;
    guidance: string;
    next_check_on: string | null;
  },
  client: SupabaseClient = supabase,
): Promise<SubordinateMemoRow> {
  const { data, error } = await client
    .from('subordinate_memos')
    .insert({
      date: input.date,
      created_by: input.created_by,
      theme_id: input.theme_id,
      kind_id: input.kind_id,
      noticed: input.noticed,
      guidance: input.guidance,
      next_check_on: input.next_check_on,
      submitted_at: null,
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throw new Error('この操作はできません');
  }
  return data as SubordinateMemoRow;
}

export async function updateMemoRow(
  memoId: string,
  patch: Partial<{
    date: string;
    theme_id: string | null;
    kind_id: string | null;
    noticed: string;
    guidance: string;
    next_check_on: string | null;
    action_check: MemoCheckValue | null;
    result_check: MemoCheckValue | null;
    checked_on: string | null;
    submitted_at: string;
    hidden_at: string | null;
  }>,
  client: SupabaseClient = supabase,
): Promise<SubordinateMemoRow> {
  // 送ったメモを書きかけに戻す操作は出さない（submitted_at に null は渡さない）
  const { data, error } = await client
    .from('subordinate_memos')
    .update(patch)
    .eq('id', memoId)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throw new Error('この操作はできません');
  }
  return data as SubordinateMemoRow;
}

export async function hideMemoRow(
  memoId: string,
  client: SupabaseClient = supabase,
): Promise<SubordinateMemoRow> {
  return updateMemoRow(memoId, { hidden_at: new Date().toISOString() }, client);
}

/**
 * 保存を1本ずつ順番に行うための直列実行キューを作る（純粋関数）。
 * 実行中の保存があれば、それが終わるのを待ってから次の処理を実行する。
 * 前の処理がエラーで終わっても、次の処理は止めずに順番に実行する。
 */
export function createSequentialTaskQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const next = tail.catch(() => undefined).then(() => task());
    tail = next;
    return next;
  };
}

/**
 * 指定したメモの対象者の行（subordinate_memo_targets）をデータベースから読み直す。
 */
export async function fetchMemoTargetRowsByMemoId(
  memoId: string,
  client: SupabaseClient = supabase,
): Promise<SubordinateMemoTargetRow[]> {
  const { data, error } = await client
    .from('subordinate_memo_targets')
    .select('*')
    .eq('memo_id', memoId);

  if (error) {
    throw new Error('この操作はできません');
  }
  return (data ?? []) as SubordinateMemoTargetRow[];
}

/**
 * 対象者の変更をデータベースに反映する。
 * 画面が持っている古い一覧は使わず、変更を計算する直前にデータベースからそのメモの対象者の行を読み直す。
 * 同じチーム制約のトリガーに引っかからないよう、先に外す人（removed_at 設定）を行ってから、
 * 戻す人（removed_at = null）・足す人（insert）の順で処理する。
 */
export async function syncMemoTargets(
  memoId: string,
  nextTargetMemberIds: string[],
  isSubmittedMemo: boolean,
  client: SupabaseClient = supabase,
): Promise<void> {
  const existingTargetRowsForMemo = await fetchMemoTargetRowsByMemoId(memoId, client);

  const { toInsert, toRestore, toRemove } = planMemoTargetChanges(
    existingTargetRowsForMemo,
    nextTargetMemberIds,
    isSubmittedMemo,
  );

  const nowIso = new Date().toISOString();

  for (const memberId of toRemove) {
    const { data, error } = await client
      .from('subordinate_memo_targets')
      .update({ removed_at: nowIso })
      .eq('memo_id', memoId)
      .eq('member_id', memberId)
      .select('memo_id')
      .maybeSingle();
    if (error || !data) {
      throw new Error('この操作はできません');
    }
  }

  for (const memberId of toRestore) {
    const { data, error } = await client
      .from('subordinate_memo_targets')
      .update({ removed_at: null })
      .eq('memo_id', memoId)
      .eq('member_id', memberId)
      .select('memo_id')
      .maybeSingle();
    if (error || !data) {
      throw new Error('この操作はできません');
    }
  }

  for (const memberId of toInsert) {
    const { data, error } = await client
      .from('subordinate_memo_targets')
      .insert({
        memo_id: memoId,
        member_id: memberId,
      })
      .select('memo_id')
      .maybeSingle();
    if (error || !data) {
      throw new Error('この操作はできません');
    }
  }
}


/**
 * メモを編集・見えなくできるか判定する（過去の記録 is_legacy = true は自分が created_by でも不可）
 */
export function canModifyMemo(
  viewerMemberId: string,
  memo: Pick<SubordinateMemoRow, 'created_by' | 'is_legacy'>,
): boolean {
  if (memo.is_legacy) return false;
  return memo.created_by === viewerMemberId;
}

/**
 * メモのテーマ・種類の表示文言（過去の記録で空のときは「（過去の記録：なし）」、今の記録で空のときは「－」）
 */
export function formatMemoMasterDisplay(
  masterId: string | null,
  isLegacy: boolean,
  masterNameMap: ReadonlyMap<string, string>,
): string {
  if (masterId) {
    return masterNameMap.get(masterId) ?? (isLegacy ? '（過去の記録：なし）' : '－');
  }
  return isLegacy ? '（過去の記録：なし）' : '－';
}
