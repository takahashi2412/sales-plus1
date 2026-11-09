// 架空データ定義（カルテ第1版①：plan_karte-common_v1）
// 社員の実名・人事評価は含めず、すべて土台の架空の人と「架空〇〇」だけにする

import { KPI_TIME_SLOTS } from '../kpi/data.mjs';

export { KPI_TIME_SLOTS };

export const FIXTURE_KARTE_SETTINGS = [
  {
    key: 'karte_call_hour_threshold',
    value: 17,
    reason: '架空データの初期設定（コール時間の線）',
  },
  {
    key: 'kpi_workdays',
    value: ['2026-10-24'],
    reason: '架空データの初期設定（稼働する土曜の一覧）',
  },
];

// 架空チームAにいて退職した人
export const FIXTURE_RETIRED_MEMBER = {
  key: 'retiredA',
  name: '架空退職メンバー',
  email: 'fixture-retired-a@example.test',
  role: 'member',
  goes_to_sales: false,
  hired_on: '2025-04-01',
  retired_on: '2026-10-07',
  teamKey: 'teamA',
  base: '架空拠点A',
  affiliation_start: '2025-04-01',
  affiliation_end: '2026-10-07',
};

// fixtures/kpi で入れている対象日（重ならないように除外する）
export const KPI_FIXTURE_DATES = new Set([
  '2026-10-29',
  '2026-10-30',
  '2026-11-02',
  '2026-11-04',
  '2026-11-05',
]);

// 会社の休みの日（kpi_holidays）
export const KARTE_HOLIDAY_DATES = new Set(['2026-10-12', '2026-11-03']);

// 土曜のうち入れる日：稼働する土曜（10-24）と、入れていない土曜1日（10-17）
export const KARTE_SATURDAY_DATES = new Set(['2026-10-17', '2026-10-24']);

/**
 * 2026-09-01 から 2026-11-06 までのうち、fixtures/karte で入れる対象日の一覧を返す
 */
export function buildKarteKpiDates() {
  const dates = [];
  const start = new Date(Date.UTC(2026, 8, 1)); // 2026-09-01
  const end = new Date(Date.UTC(2026, 10, 6)); // 2026-11-06

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const iso = `${yyyy}-${mm}-${dd}`;
    const dayOfWeek = d.getUTCDay(); // 0: Sun, 6: Sat

    if (KPI_FIXTURE_DATES.has(iso)) continue;
    if (KARTE_HOLIDAY_DATES.has(iso)) continue;

    if (dayOfWeek === 0) continue; // 日曜は入れない
    if (dayOfWeek === 6) {
      if (KARTE_SATURDAY_DATES.has(iso)) {
        dates.push(iso);
      }
      continue;
    }

    dates.push(iso);
  }
  return dates;
}

export const KARTE_KPI_DATES = buildKarteKpiDates();

// 架空退職メンバーの KPI も一緒に入れる日（退職日 2026-10-07 以前の数日）
export const RETIRED_MEMBER_KPI_DATES = new Set([
  '2026-09-10',
  '2026-09-18',
  '2026-09-28',
  '2026-10-02',
  '2026-10-06',
  '2026-10-07',
]);

/**
 * 日によって上下させ、弱い時間帯（例：memberA は14時・16時台、memberB は11時・15時台）がわかるようにした
 * 14時間帯の架空数字を返す
 */
export function buildKarteSlotNumbers(memberKey, dateStr, slot) {
  const activeHours = ['9', '10', '11', '12', '14', '15', '16', '17'];
  if (!activeHours.includes(slot)) {
    return { total: 0, connected: 0, recall: 0, owner: 0, prospect: 0, apo: 0 };
  }

  // 日付から日ごとの波（-2〜+3）を作る
  const dayNum = Number(dateStr.slice(-2));
  const monthNum = Number(dateStr.slice(5, 7));
  const wave = ((dayNum * 3 + monthNum) % 6) - 2;

  if (memberKey === 'leaderA') {
    const isWeakSlot = slot === '16';
    const total = Math.max(8, 15 + wave - (isWeakSlot ? 4 : 0));
    const connected = Math.max(2, Math.round(total * (isWeakSlot ? 0.28 : 0.42)));
    const recall = Math.max(1, Math.round(total * 0.25));
    const owner = Math.max(1, Math.round(total * (isWeakSlot ? 0.08 : 0.17)));
    const prospect = slot === '10' || slot === '15' ? 1 : 0;
    const apo = !isWeakSlot && (slot === '10' || (slot === '14' && dayNum % 2 === 0)) ? 1 : 0;
    return { total, connected, recall, owner, prospect, apo };
  }

  if (memberKey === 'memberA') {
    // 14時台・16時台が弱い（接続・オーナー・アポが落ちる）
    const isWeakSlot = slot === '14' || slot === '16';
    const total = Math.max(8, 16 + wave - (isWeakSlot ? 5 : 0));
    const connected = Math.max(2, Math.round(total * (isWeakSlot ? 0.25 : 0.41)));
    const recall = Math.max(1, Math.round(total * 0.28));
    const owner = Math.max(0, Math.round(total * (isWeakSlot ? 0.06 : 0.16)));
    const prospect = !isWeakSlot && (slot === '10' || slot === '15') ? 1 : 0;
    const apo = !isWeakSlot && (slot === '10' || (slot === '11' && dayNum % 3 !== 0)) ? 1 : 0;
    return { total, connected, recall, owner, prospect, apo };
  }

  if (memberKey === 'memberB') {
    // 11時台・15時台が弱い
    const isWeakSlot = slot === '11' || slot === '15';
    const total = Math.max(7, 15 + wave - (isWeakSlot ? 4 : 0));
    const connected = Math.max(2, Math.round(total * (isWeakSlot ? 0.24 : 0.39)));
    const recall = Math.max(1, Math.round(total * 0.3));
    const owner = Math.max(0, Math.round(total * (isWeakSlot ? 0.06 : 0.15)));
    const prospect = !isWeakSlot && slot === '10' ? 1 : 0;
    const apo = !isWeakSlot && (slot === '10' || (slot === '16' && dayNum % 2 === 1)) ? 1 : 0;
    return { total, connected, recall, owner, prospect, apo };
  }

  // retiredA（架空退職メンバー）
  const total = Math.max(8, 13 + wave);
  const connected = Math.max(2, Math.round(total * 0.35));
  const recall = Math.max(1, Math.round(total * 0.25));
  const owner = Math.max(1, Math.round(total * 0.13));
  const prospect = slot === '10' ? 1 : 0;
  const apo = slot === '10' && dayNum % 2 === 0 ? 1 : 0;
  return { total, connected, recall, owner, prospect, apo };
}

// 9月と10月の月の目標（11月は fixtures/kpi にあるため入れない）
export const FIXTURE_KARTE_TARGETS = [
  // 2026年9月
  {
    memberKey: 'leaderA',
    month: '2026-09-01',
    goes_to_sales: true,
    target_profit: 400,
    unit_price: 40,
    completion_rate: 80,
    rate_order: 25,
    apo_target: null,
    working_days: 22,
    call_hours: 5,
    term: 20,
    rate_connected: 42,
    rate_recall: 30,
    rate_owner: 16,
    rate_prospect: 4,
    rate_apo_owner: 10,
    rate_adoption: 80,
  },
  {
    memberKey: 'memberA',
    month: '2026-09-01',
    goes_to_sales: true,
    target_profit: 320,
    unit_price: 40,
    completion_rate: 80,
    rate_order: 25,
    apo_target: null,
    working_days: 22,
    call_hours: 6,
    term: 20,
    rate_connected: 40,
    rate_recall: 30,
    rate_owner: 15,
    rate_prospect: 3,
    rate_apo_owner: 8,
    rate_adoption: 80,
  },
  {
    memberKey: 'memberB',
    month: '2026-09-01',
    goes_to_sales: false,
    target_profit: null,
    unit_price: null,
    completion_rate: null,
    rate_order: null,
    apo_target: 28,
    working_days: 22,
    call_hours: 6,
    term: 20,
    rate_connected: 38,
    rate_recall: 32,
    rate_owner: 14,
    rate_prospect: 3,
    rate_apo_owner: 8,
    rate_adoption: 80,
  },
  {
    memberKey: 'retiredA',
    month: '2026-09-01',
    goes_to_sales: false,
    target_profit: null,
    unit_price: null,
    completion_rate: null,
    rate_order: null,
    apo_target: 24,
    working_days: 22,
    call_hours: 5,
    term: 20,
    rate_connected: 36,
    rate_recall: 30,
    rate_owner: 13,
    rate_prospect: 3,
    rate_apo_owner: 8,
    rate_adoption: 80,
  },
  // 2026年10月（稼働土曜 10-24 を含めて22営業日）
  {
    memberKey: 'leaderA',
    month: '2026-10-01',
    goes_to_sales: true,
    target_profit: 400,
    unit_price: 40,
    completion_rate: 80,
    rate_order: 25,
    apo_target: null,
    working_days: 22,
    call_hours: 5,
    term: 20,
    rate_connected: 42,
    rate_recall: 30,
    rate_owner: 16,
    rate_prospect: 4,
    rate_apo_owner: 10,
    rate_adoption: 80,
  },
  {
    memberKey: 'memberA',
    month: '2026-10-01',
    goes_to_sales: true,
    target_profit: 320,
    unit_price: 40,
    completion_rate: 80,
    rate_order: 25,
    apo_target: null,
    working_days: 22,
    call_hours: 6,
    term: 20,
    rate_connected: 40,
    rate_recall: 30,
    rate_owner: 15,
    rate_prospect: 3,
    rate_apo_owner: 8,
    rate_adoption: 80,
  },
  {
    memberKey: 'memberB',
    month: '2026-10-01',
    goes_to_sales: false,
    target_profit: null,
    unit_price: null,
    completion_rate: null,
    rate_order: null,
    apo_target: 30,
    working_days: 22,
    call_hours: 6,
    term: 20,
    rate_connected: 38,
    rate_recall: 32,
    rate_owner: 14,
    rate_prospect: 3,
    rate_apo_owner: 8,
    rate_adoption: 80,
  },
  {
    memberKey: 'retiredA',
    month: '2026-10-01',
    goes_to_sales: false,
    target_profit: null,
    unit_price: null,
    completion_rate: null,
    rate_order: null,
    apo_target: 6,
    working_days: 5,
    call_hours: 5,
    term: 20,
    rate_connected: 36,
    rate_recall: 30,
    rate_owner: 13,
    rate_prospect: 3,
    rate_apo_owner: 8,
    rate_adoption: 80,
  },
];

// 退職した人（架空退職メンバー）のロープレ記録（書いた人はリーダーA）
export const FIXTURE_RETIRED_ROLEPLAYS = [
  {
    date: '2026-09-18',
    runnerKey: 'leaderA',
    memberKey: 'retiredA',
    time_slot: '10',
    kind: 'apo',
    themeNo: 101,
    minutes: 15,
    homework_result: 'o',
    repeat_count: 2,
    pass_result: 'o',
    next_homework: '架空の次回宿題：声のトーンを保って時間切りに進む',
    fixed_point: '架空の直した点（退職メンバー1）：冒頭の名乗りのあとに一拍置く形に整えた',
    note: '架空のメモ：落ち着いて話せていた',
    submitted_at: '2026-09-18T02:00:00Z',
  },
  {
    date: '2026-10-02',
    runnerKey: 'leaderA',
    memberKey: 'retiredA',
    time_slot: '14',
    kind: 'apo',
    themeNo: 102,
    minutes: 20,
    homework_result: 'o',
    repeat_count: 1,
    pass_result: 'd',
    next_homework: '架空の次回宿題：2択の日時提示まで言い切る',
    fixed_point: '架空の直した点（退職メンバー2）：1回目の断りに対する受け止めの言葉を短くした',
    note: '架空のメモ：後半の間合いを意識する',
    submitted_at: '2026-10-02T05:30:00Z',
  },
];

// 退職した人（架空退職メンバー）の部下メモ（書いた人はリーダーA）
export const FIXTURE_RETIRED_MEMOS = [
  {
    date: '2026-09-24',
    writerKey: 'leaderA',
    targetKey: 'retiredA',
    themeName: 'アポ',
    kindName: '指摘・指導',
    noticed: '架空の気づき（退職メンバー1）：午後の架電で最初の名乗りが早口になっていた',
    guidance: '架空の指導（退職メンバー1）：社名のあとに一拍置いてから担当者名を伝える形を確認した',
    next_check_on: '2026-10-01',
    action_check: 'o',
    result_check: 'o',
    checked_on: '2026-10-01',
    submitted_at: '2026-09-24T08:30:00Z',
  },
  {
    date: '2026-10-05',
    writerKey: 'leaderA',
    targetKey: 'retiredA',
    themeName: '管理',
    kindName: '1on1・面談',
    noticed: '架空の気づき（退職メンバー2）：退職日までの引き継ぎリストの整理が進んでいた',
    guidance: '架空の指導（退職メンバー2）：再コール予定の先方メモをチーム共有シートにまとめる手順を確認した',
    next_check_on: null,
    action_check: null,
    result_check: null,
    checked_on: null,
    submitted_at: '2026-10-05T09:00:00Z',
  },
];

// 過去の形の記録：ロープレ3件（対象はメンバーA、is_legacy = true、legacy_source あり）
export const FIXTURE_LEGACY_ROLEPLAYS = [
  {
    date: '2026-08-12',
    runnerKey: 'leaderA',
    memberKey: 'memberA',
    time_slot: '10',
    kind: 'apo',
    themeNo: 101,
    minutes: 15,
    homework_result: 'o',
    repeat_count: 2,
    pass_result: 'o',
    next_homework: '架空の旧シート次回宿題1',
    fixed_point: '架空の過去ロープレ記録1：冒頭スクリプトの暗記と声の張りを確認',
    note: '架空の旧シート備考1',
    submitted_at: '2026-08-12T02:00:00Z',
    is_legacy: true,
    legacy_source: {
      sheet: '架空旧ロープレ記録シート',
      row_no: 11,
      raw_theme: '旧表記：冒頭スクリプト暗記',
      raw_text: '架空の元の行1：10時台 15分 合格',
    },
  },
  {
    date: '2026-08-20',
    runnerKey: 'leaderA',
    memberKey: 'memberA',
    time_slot: '14',
    kind: 'apo',
    themeNo: 103,
    minutes: 20,
    homework_result: 'd',
    repeat_count: 3,
    pass_result: 'd',
    next_homework: '架空の旧シート次回宿題2',
    fixed_point: '架空の過去ロープレ記録2：時間切り前のアウト返しで一拍置く練習',
    note: '架空の旧シート備考2',
    submitted_at: '2026-08-20T05:30:00Z',
    is_legacy: true,
    legacy_source: {
      sheet: '架空旧ロープレ記録シート',
      row_no: 24,
      raw_theme: '旧表記：アウト返し基礎',
      raw_text: '架空の元の行2：14時台 20分 △',
    },
  },
  {
    date: '2026-08-28',
    runnerKey: 'leaderA',
    memberKey: 'memberA',
    time_slot: '16',
    kind: 'sales',
    themeNo: 201,
    minutes: 25,
    homework_result: 'o',
    repeat_count: 2,
    pass_result: 'o',
    next_homework: '架空の旧シート次回宿題3',
    fixed_point: '架空の過去ロープレ記録3：商談冒頭の現状ヒアリング3項目の順番を整理',
    note: '架空の旧シート備考3',
    submitted_at: '2026-08-28T07:30:00Z',
    is_legacy: true,
    legacy_source: {
      sheet: '架空旧ロープレ記録シート',
      row_no: 38,
      raw_theme: '旧表記：商談ヒアリング導入',
      raw_text: '架空の元の行3：16時台 25分 ○',
    },
  },
];

// 過去の形の記録：部下メモ3件（対象はメンバーA、is_legacy = true、legacy_source あり）
export const FIXTURE_LEGACY_MEMOS = [
  {
    date: '2026-08-10',
    writerKey: 'leaderA',
    targetKey: 'memberA',
    themeName: 'アポ',
    kindName: '指摘・指導',
    noticed: '架空の過去部下メモ1（気づき）：14時台の架電開始が少し遅れがちだった',
    guidance: '架空の過去部下メモ1（指導）：13時55分にリストを10件開いてから午後の架電に入る手順を決めた',
    next_check_on: '2026-08-17',
    action_check: 'o',
    result_check: 'o',
    checked_on: '2026-08-17',
    submitted_at: '2026-08-10T09:00:00Z',
    is_legacy: true,
    legacy_source: {
      sheet: '架空旧部下メモシート',
      row_no: 5,
      raw_tag: '旧タグ：アポ・午後立ち上がり',
      raw_text: '架空の元の部下メモ行1',
    },
  },
  {
    date: '2026-08-19',
    writerKey: 'leaderA',
    targetKey: 'memberA',
    themeName: 'リスト',
    kindName: '指摘・指導',
    noticed: '架空の過去部下メモ2（気づき）：不在だった先方への再コール時間帯が同じ時間に重なっていた',
    guidance: '架空の過去部下メモ2（指導）：午前不在の先方は16時以降に回すルールを徹底した',
    next_check_on: '2026-08-26',
    action_check: 'o',
    result_check: 'd',
    checked_on: '2026-08-26',
    submitted_at: '2026-08-19T09:15:00Z',
    is_legacy: true,
    legacy_source: {
      sheet: '架空旧部下メモシート',
      row_no: 14,
      raw_tag: '旧タグ：リスト回し方',
      raw_text: '架空の元の部下メモ行2',
    },
  },
  {
    date: '2026-08-27',
    writerKey: 'leaderA',
    targetKey: 'memberA',
    themeName: '営業',
    kindName: 'ほめた',
    noticed: '架空の過去部下メモ3（気づき）：商談前の事前準備シートの記入が丁寧で、質問の意図が明確だった',
    guidance: '架空の過去部下メモ3（指導）：事前準備の型をチーム内にも共有してもらうよう伝えた',
    next_check_on: null,
    action_check: null,
    result_check: null,
    checked_on: null,
    submitted_at: '2026-08-27T09:30:00Z',
    is_legacy: true,
    legacy_source: {
      sheet: '架空旧部下メモシート',
      row_no: 29,
      raw_tag: '旧タグ：営業準備・好事例',
      raw_text: '架空の元の部下メモ行3',
    },
  },
];
