export const DEV_ROLE_KEYS = ['ceo', 'leader', 'member', 'mgr', 'talk-owner'];

export const DEV_ROLE_USAGE = [
  '使い方: npm run fixtures:dev-role -- <ceo|leader|member|mgr|talk-owner>',
  '  ceo        : 代表（所属・担当・権限なし。元に戻す）',
  '  leader     : 架空チームAのリーダー（拠点：架空拠点A、開始：2025-04-01）',
  '  member     : 架空チームAのメンバー（拠点：架空拠点A、開始：2025-04-01）',
  '  mgr        : 架空チームAの担当MGR（開始：2025-04-01）',
  '  talk-owner : 架空チームBのメンバー（拠点：架空拠点B、開始：2025-04-01、トーク責任者）',
].join('\n');

const PLANS = {
  ceo: {
    key: 'ceo',
    label: '代表',
    role: 'ceo',
    affiliation: null,
    mgrAssignment: null,
    permission: null,
  },
  leader: {
    key: 'leader',
    label: '架空チームAのリーダー',
    role: 'leader',
    affiliation: {
      teamName: '架空チームA',
      base: '架空拠点A',
      start_date: '2025-04-01',
      end_date: null,
    },
    mgrAssignment: null,
    permission: null,
  },
  member: {
    key: 'member',
    label: '架空チームAのメンバー',
    role: 'member',
    affiliation: {
      teamName: '架空チームA',
      base: '架空拠点A',
      start_date: '2025-04-01',
      end_date: null,
    },
    mgrAssignment: null,
    permission: null,
  },
  mgr: {
    key: 'mgr',
    label: '架空チームAの担当MGR',
    role: 'mgr',
    affiliation: null,
    mgrAssignment: {
      teamName: '架空チームA',
      start_date: '2025-04-01',
      end_date: null,
      assigned_by: null,
    },
    permission: null,
  },
  'talk-owner': {
    key: 'talk-owner',
    label: '架空チームBのメンバー（トーク責任者）',
    role: 'member',
    affiliation: {
      teamName: '架空チームB',
      base: '架空拠点B',
      start_date: '2025-04-01',
      end_date: null,
    },
    mgrAssignment: null,
    permission: {
      kind: 'talk_owner',
      granted_by: null,
      revoked_by: null,
      revoked_at: null,
    },
  },
};

/**
 * 引数からテスト代表の切り替え先（役割・所属・MGR担当・権限）を返す。
 * 引数がない・知らない引数のときは null を返す。
 *
 * @param {unknown} arg
 */
export function resolveDevRolePlan(arg) {
  if (typeof arg !== 'string' || !Object.hasOwn(PLANS, arg)) {
    return null;
  }
  const plan = PLANS[arg];
  return {
    key: plan.key,
    label: plan.label,
    role: plan.role,
    affiliation: plan.affiliation ? { ...plan.affiliation } : null,
    mgrAssignment: plan.mgrAssignment ? { ...plan.mgrAssignment } : null,
    permission: plan.permission ? { ...plan.permission } : null,
  };
}
