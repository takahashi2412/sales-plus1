export const FIXTURE_TEAMS = [
  { key: 'teamA', name: '架空チームA' },
  { key: 'teamB', name: '架空チームB' },
];

export const FIXTURE_MEMBERS = [
  {
    key: 'leaderA',
    name: 'リーダーA',
    email: 'fixture-leader-a@example.test',
    role: 'leader',
    goes_to_sales: true,
    hired_on: '2025-04-01',
    teamKey: 'teamA',
    base: '架空拠点A',
  },
  {
    key: 'memberA',
    name: 'メンバーA',
    email: 'fixture-member-a@example.test',
    role: 'member',
    goes_to_sales: true,
    hired_on: '2025-04-01',
    teamKey: 'teamA',
    base: '架空拠点A',
  },
  {
    key: 'memberB',
    name: 'メンバーB',
    email: 'fixture-member-b@example.test',
    role: 'member',
    goes_to_sales: false,
    hired_on: '2025-06-01',
    teamKey: 'teamA',
    base: '架空拠点B',
  },
  {
    key: 'leaderB',
    name: 'リーダーB',
    email: 'fixture-leader-b@example.test',
    role: 'leader',
    goes_to_sales: true,
    hired_on: '2025-04-01',
    teamKey: 'teamB',
    base: '架空拠点B',
    isAdmin: true,
  },
  {
    key: 'memberC',
    name: 'メンバーC',
    email: 'fixture-member-c@example.test',
    role: 'member',
    goes_to_sales: false,
    hired_on: '2025-07-01',
    teamKey: 'teamB',
    base: '架空拠点A',
  },
  {
    key: 'mgrA',
    name: 'MGR_A',
    email: 'fixture-mgr-a@example.test',
    role: 'mgr',
    goes_to_sales: false,
    hired_on: '2024-04-01',
    assignedTeamKey: 'teamA',
  },
];

export const TEST_CEO_NAME = 'テスト代表';
