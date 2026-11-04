import { getTodayJstDateString } from '../../../foundation/directory';
import type { MemberRow } from '../../../foundation/types';
import type { SeminarMemberRow, SeminarRow, ViewerContext } from '../shared';

export interface SeminarMemberMutationPlan {
  toInsert: string[];
  toRestore: string[];
  toRemove: string[];
}

export function canEditSeminar(viewer: ViewerContext, seminarCreatedBy: string): boolean {
  return viewer.memberId === seminarCreatedBy;
}

export function pickSeminarCandidateMembers(
  members: MemberRow[],
  todayJst: string = getTodayJstDateString(),
): MemberRow[] {
  return members
    .filter((m) => m.retired_on === null || m.retired_on >= todayJst)
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

export function planSeminarMemberMutations(
  existingRows: SeminarMemberRow[],
  selectedMemberIds: string[],
): SeminarMemberMutationPlan {
  const selectedSet = new Set(selectedMemberIds);
  const existingMap = new Map<string, SeminarMemberRow>();
  for (const row of existingRows) {
    existingMap.set(row.member_id, row);
  }

  const toInsert: string[] = [];
  const toRestore: string[] = [];
  const toRemove: string[] = [];

  for (const memberId of selectedSet) {
    const existing = existingMap.get(memberId);
    if (!existing) {
      toInsert.push(memberId);
    } else if (existing.removed_at !== null) {
      toRestore.push(memberId);
    }
  }

  for (const row of existingRows) {
    if (row.removed_at === null && !selectedSet.has(row.member_id)) {
      toRemove.push(row.member_id);
    }
  }

  return { toInsert, toRestore, toRemove };
}

export function planSingleParticipantAdd(
  existingRows: SeminarMemberRow[],
  memberId: string,
): 'insert' | 'restore' | 'noop' {
  const existing = existingRows.find((r) => r.member_id === memberId);
  if (!existing) {
    return 'insert';
  }
  if (existing.removed_at !== null) {
    return 'restore';
  }
  return 'noop';
}

export function sortSeminars(seminars: SeminarRow[]): SeminarRow[] {
  return [...seminars]
    .filter((s) => s.hidden_at === null)
    .sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return a.theme.localeCompare(b.theme, 'ja');
    });
}

export function formatSeminarMemberName(
  memberId: string,
  memberNameMap: Map<string, string>,
): string {
  return memberNameMap.get(memberId) ?? '名簿で見られない人';
}
