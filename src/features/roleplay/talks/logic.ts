import { getTodayJstDateString } from '../../../foundation/directory';
import type { TeamRow } from '../../../foundation/types';
import type {
  MasterKind,
  MasterRow,
  RoleplayRow,
  TalkRow,
  TalkStatus,
  ViewerContext,
} from '../shared';
import { selectableTalkTeams } from '../shared';

export type TalkPrefix = 'OUT' | 'SC';

export const TALK_PREFIX_LABELS: Record<TalkPrefix, string> = {
  OUT: '返し（OUT-）',
  SC: 'スクリプト（SC-）',
};

export interface TalkStats {
  practiceCount: number;
  passEvaluatedCount: number;
  passOkCount: number;
  passRateNumber: number | null;
  passRateText: string;
}

export interface TalkFilterCriteria {
  sceneId: string;
  industryId: string;
  listTypeId: string;
  prefix: '' | TalkPrefix;
  status: '' | TalkStatus;
}

const STATUS_SORT_ORDER: Record<TalkStatus, number> = {
  pending: 1,
  trial: 2,
  standard: 3,
};

export function getTalkPrefix(code: string): TalkPrefix {
  return code.startsWith('SC-') ? 'SC' : 'OUT';
}

export function generateTalkCode(
  prefix: TalkPrefix,
  todayJst: string = getTodayJstDateString(),
  uuid: string = crypto.randomUUID(),
): string {
  const dateDigits = todayJst.replace(/\D/g, '').slice(0, 8);
  const suffix = uuid.replace(/-/g, '').slice(0, 4).toUpperCase();
  return `${prefix}-${dateDigits}-${suffix}`;
}

export function computeTalkStatsMap(roleplays: RoleplayRow[]): Map<string, TalkStats> {
  const counts = new Map<
    string,
    { practiceCount: number; passEvaluatedCount: number; passOkCount: number }
  >();

  for (const rp of roleplays) {
    // 送った記録（submitted_at あり）で見えなくしていない（hidden_at が空）ものだけ数える
    if (!rp.submitted_at || rp.hidden_at !== null) {
      continue;
    }
    if (!rp.used_talk_id) {
      continue;
    }

    const current = counts.get(rp.used_talk_id) ?? {
      practiceCount: 0,
      passEvaluatedCount: 0,
      passOkCount: 0,
    };

    current.practiceCount += 1;
    if (rp.pass_result !== null) {
      current.passEvaluatedCount += 1;
      if (rp.pass_result === 'o') {
        current.passOkCount += 1;
      }
    }

    counts.set(rp.used_talk_id, current);
  }

  const result = new Map<string, TalkStats>();
  for (const [talkId, item] of counts.entries()) {
    const passRateNumber =
      item.passEvaluatedCount > 0
        ? Math.round((item.passOkCount / item.passEvaluatedCount) * 100)
        : null;
    const passRateText = passRateNumber !== null ? `${passRateNumber}%` : '－';
    result.set(talkId, {
      practiceCount: item.practiceCount,
      passEvaluatedCount: item.passEvaluatedCount,
      passOkCount: item.passOkCount,
      passRateNumber,
      passRateText,
    });
  }

  return result;
}

export function getTalkStatsForId(
  statsMap: Map<string, TalkStats>,
  talkId: string,
): TalkStats {
  return (
    statsMap.get(talkId) ?? {
      practiceCount: 0,
      passEvaluatedCount: 0,
      passOkCount: 0,
      passRateNumber: null,
      passRateText: '－',
    }
  );
}

export function getActiveMasterOptions(
  masters: MasterRow[],
  kind: MasterKind,
  currentId?: string | null,
): { value: string; label: string }[] {
  return masters
    .filter((m) => m.kind === kind && (m.is_active || (currentId && m.id === currentId)))
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.name.localeCompare(b.name, 'ja');
    })
    .map((m) => ({
      value: m.id,
      label: m.is_active ? m.name : `${m.name}（停止中）`,
    }));
}

export function filterAndSortTalks(
  talks: TalkRow[],
  criteria: TalkFilterCriteria,
  masters: MasterRow[],
): TalkRow[] {
  const sceneOrderMap = new Map<string, number>();
  for (const m of masters) {
    if (m.kind === 'scene') {
      sceneOrderMap.set(m.id, m.sort_order);
    }
  }

  return talks
    .filter((t) => {
      if (t.hidden_at !== null) return false;
      if (criteria.sceneId && t.scene_id !== criteria.sceneId) return false;
      if (criteria.industryId && t.industry_id !== criteria.industryId) return false;
      if (criteria.listTypeId && t.list_type_id !== criteria.listTypeId) return false;
      if (criteria.prefix && getTalkPrefix(t.code) !== criteria.prefix) return false;
      if (criteria.status && t.status !== criteria.status) return false;
      return true;
    })
    .sort((a, b) => {
      const sceneA =
        a.scene_id && sceneOrderMap.has(a.scene_id)
          ? sceneOrderMap.get(a.scene_id)!
          : Number.MAX_SAFE_INTEGER;
      const sceneB =
        b.scene_id && sceneOrderMap.has(b.scene_id)
          ? sceneOrderMap.get(b.scene_id)!
          : Number.MAX_SAFE_INTEGER;
      if (sceneA !== sceneB) return sceneA - sceneB;

      const statusA = STATUS_SORT_ORDER[a.status] ?? 99;
      const statusB = STATUS_SORT_ORDER[b.status] ?? 99;
      if (statusA !== statusB) return statusA - statusB;

      return a.code.localeCompare(b.code, 'ja');
    });
}

export function buildTalkTeamOptions(
  viewer: ViewerContext,
  teams: TeamRow[],
  currentTeamId?: string | null,
  isEditing = false,
): { value: string; label: string }[] {
  const selectable = selectableTalkTeams(viewer, teams);
  const teamMap = new Map<string, string>(teams.map((t) => [t.id, t.name]));
  const options: { value: string; label: string }[] = [];

  if (selectable.allowNoTeam) {
    options.push({ value: '', label: 'チームなし（全体）' });
  } else if (isEditing && currentTeamId === null) {
    options.push({ value: '', label: 'チームなし（全体・今のまま）' });
  }

  const includedTeamIds = new Set<string>();
  for (const teamId of selectable.teamIds) {
    includedTeamIds.add(teamId);
    options.push({
      value: teamId,
      label: teamMap.get(teamId) ?? 'ほかのチーム',
    });
  }

  if (isEditing && currentTeamId && !includedTeamIds.has(currentTeamId)) {
    const existingName = teamMap.get(currentTeamId);
    options.unshift({
      value: currentTeamId,
      label: existingName ? `${existingName}（今のまま）` : 'ほかのチーム（今のまま）',
    });
  }

  return options;
}

export function formatTalkTeamDisplay(
  teamId: string | null,
  teamMap: Map<string, string>,
): string {
  if (teamId === null) {
    return '全体（チームなし）';
  }
  return teamMap.get(teamId) ?? 'ほかのチーム';
}

export function formatMemberDisplay(
  memberId: string,
  memberMap: Map<string, string>,
): string {
  return memberMap.get(memberId) ?? '名簿で見られない人';
}
