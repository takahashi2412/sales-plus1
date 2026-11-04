import type {
  DirectoryEntry,
  MemberAffiliationRow,
  MemberRole,
  MemberRow,
  MgrAssignmentRow,
  TeamRow,
} from './types';

export const ROLE_LABELS: Record<MemberRole, string> = {
  member: 'メンバー',
  leader: 'リーダー',
  mgr: 'MGR',
  ceo: '代表',
};

export function getTodayJstDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function isActivePeriod(
  startDate: string,
  endDate: string | null,
  todayJst: string,
): boolean {
  if (startDate > todayJst) return false;
  if (endDate !== null && endDate < todayJst) return false;
  return true;
}

export function buildDirectoryEntries(
  members: MemberRow[],
  teams: TeamRow[],
  affiliations: MemberAffiliationRow[],
  mgrAssignments: MgrAssignmentRow[],
  todayJst: string = getTodayJstDateString(),
): DirectoryEntry[] {
  const teamMap = new Map<string, string>(teams.map((t) => [t.id, t.name]));

  const activeAffiliations = affiliations.filter((a) =>
    isActivePeriod(a.start_date, a.end_date, todayJst),
  );
  const activeMgrAssignments = mgrAssignments.filter((a) =>
    isActivePeriod(a.start_date, a.end_date, todayJst),
  );

  return [...members]
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    .map((m) => {
      const memberAffs = activeAffiliations.filter((a) => a.member_id === m.id);
      const affTeamNames = memberAffs
        .map((a) => teamMap.get(a.team_id))
        .filter((n): n is string => Boolean(n));
      const bases = Array.from(new Set(memberAffs.map((a) => a.base).filter(Boolean)));

      let currentTeamText = affTeamNames.join('・');
      if (!currentTeamText && m.role === 'mgr') {
        const assignedNames = activeMgrAssignments
          .filter((a) => a.mgr_member_id === m.id)
          .map((a) => teamMap.get(a.team_id))
          .filter((n): n is string => Boolean(n));
        if (assignedNames.length > 0) {
          currentTeamText = `担当：${assignedNames.join('・')}`;
        }
      }
      if (!currentTeamText) {
        currentTeamText = m.role === 'ceo' ? '全体（所属チームなし）' : '所属なし';
      }

      return {
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        roleLabel: ROLE_LABELS[m.role] ?? m.role,
        currentTeamText,
        currentBaseText: bases.length > 0 ? bases.join('・') : '－',
        goesToSales: m.goes_to_sales,
        hiredOn: m.hired_on,
      };
    });
}
