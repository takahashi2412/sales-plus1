// 架空データ定義（ロープレ①：plan_roleplay-common_v1）
// 社員の実名・本物のトークは含めず、すべて架空の名前と例だけにする

export const FIXTURE_SETTINGS = [
  { key: 'roleplay_alert_minutes', value: 30, reason: '架空データの初期設定（注意の分）' },
  { key: 'roleplay_alert_days', value: 14, reason: '架空データの初期設定（注意の日数）' },
  { key: 'roleplay_graduate_count', value: 2, reason: '架空データの初期設定（卒業の候補にする○の回数）' },
  { key: 'roleplay_check_days', value: 14, reason: '架空データの初期設定（卒業から確認までの日数）' },
];

export const FIXTURE_MASTERS = [
  // 場面（scene）
  { key: 'scene_apo_intro', kind: 'scene', name: '架空場面：冒頭（アポ）', sort_order: 1 },
  { key: 'scene_apo_out_before', kind: 'scene', name: '架空場面：アウト返し（時間切りの前）', sort_order: 2 },
  { key: 'scene_apo_time', kind: 'scene', name: '架空場面：時間切り', sort_order: 3 },
  { key: 'scene_sales_hearing', kind: 'scene', name: '架空場面：冒頭・ヒアリング（営業）', sort_order: 4 },
  // 業種（industry）
  { key: 'ind_common', kind: 'industry', name: '架空業種：共通', sort_order: 1 },
  { key: 'ind_store', kind: 'industry', name: '架空業種：店舗', sort_order: 2 },
  { key: 'ind_construct', kind: 'industry', name: '架空業種：建設・リフォーム', sort_order: 3 },
  // リストの種類（list_type）
  { key: 'list_portal', kind: 'list_type', name: '架空リスト：掲載店一覧', sort_order: 1 },
  { key: 'list_newcorp', kind: 'list_type', name: '架空リスト：新設法人', sort_order: 2 },
];

export const FIXTURE_THEMES = [
  {
    key: 'theme_s1',
    no: 101,
    stage: 1,
    name: '架空テーマ1：スクリプトの暗記（冒頭）',
    kind: 'apo',
    pass_example: '架空の合格例：台本を見ずに冒頭30秒をよどみなく言える',
  },
  {
    key: 'theme_s2',
    no: 102,
    stage: 2,
    name: '架空テーマ2：声のトーンと間合い',
    kind: 'apo',
    pass_example: '架空の合格例：名乗りのあとに一拍置いて用件に入れる',
  },
  {
    key: 'theme_s3',
    no: 103,
    stage: 3,
    name: '架空テーマ3：アウト返し（時間切りの前）',
    kind: 'apo',
    pass_example: '架空の合格例：1回目の断りを受け止めてから時間切りまで進める',
  },
  {
    key: 'theme_s4',
    no: 104,
    stage: 4,
    name: '架空テーマ4：時間切りと日程の確定',
    kind: 'apo',
    pass_example: '架空の合格例：2択で日時を提示してその場で確定できる',
  },
  {
    key: 'theme_s5',
    no: 105,
    stage: 5,
    name: '架空テーマ5：時間切りのあとの断り対応',
    kind: 'apo',
    pass_example: '架空の合格例：日程提示後の不安を聞き出して解消できる',
  },
  {
    key: 'theme_s6',
    no: 201,
    stage: 6,
    name: '架空テーマ6：営業ヒアリングと課題整理',
    kind: 'sales',
    pass_example: '架空の合格例：現状の集客手段と課題を3つ聞き出せる',
  },
];

export const FIXTURE_TALKS = [
  {
    code: 'OUT-FIXTURE-001',
    sceneKey: 'scene_apo_out_before',
    industryKey: 'ind_common',
    listTypeKey: 'list_portal',
    their_words: '架空の相手の言葉：今は忙しいので間に合っています',
    wording: '架空の言い方：お忙しいところ恐れ入ります。1分だけご挨拶のお時間をいただけますか',
    aim: '架空のねらい：短い時間で済むことを伝えて話を続けてもらう',
    teamKey: 'teamA',
    creatorMemberKey: 'leaderA',
    status: 'standard',
  },
  {
    code: 'OUT-FIXTURE-002',
    sceneKey: 'scene_apo_time',
    industryKey: 'ind_store',
    listTypeKey: 'list_portal',
    their_words: '架空の相手の言葉：資料だけ先に送ってください',
    wording: '架空の言い方：ありがとうございます。合う資料をお選びするため1つだけ伺ってもよろしいですか',
    aim: '架空のねらい：資料送付で終わらせず質問につなげる',
    teamKey: 'teamA',
    creatorMemberKey: 'leaderA',
    status: 'trial',
  },
  {
    code: 'OUT-FIXTURE-003',
    sceneKey: 'scene_apo_out_before',
    industryKey: 'ind_construct',
    listTypeKey: 'list_newcorp',
    their_words: '架空の相手の言葉：うちは紹介だけでやっているので不要です',
    wording: '架空の言い方：ご紹介で続いていらっしゃるのは素晴らしいですね。実は同じような会社様で…',
    aim: '架空のねらい：肯定してから同業の事例に切り替える',
    teamKey: 'teamA',
    creatorMemberKey: 'memberA',
    status: 'pending',
  },
  {
    code: 'SC-FIXTURE-001',
    sceneKey: 'scene_sales_hearing',
    industryKey: 'ind_common',
    listTypeKey: null,
    their_words: '架空の場面：商談冒頭のアイスブレイクとヒアリング導入',
    wording: '架空の台本：本日はお時間をいただきありがとうございます。まず現在の状況からお伺いします',
    aim: '架空のねらい：商談の進め方を共有して話しやすくする',
    teamKey: 'teamB',
    creatorMemberKey: 'leaderB',
    status: 'standard',
  },
];

export const FIXTURE_SEMINARS = [
  {
    date: '2026-10-15',
    theme: '架空研修：アウト返しの基本と受け止め方',
    lecturer: 'リーダーA（架空講師）',
    minutes: 45,
    content: '架空の研修内容：時間切り前の代表的な断り3パターンに対する受け止めと切り返しの練習。',
    creatorMemberKey: 'leaderA',
    participantMemberKeys: ['memberA', 'memberB'],
  },
];

// トーク責任者の権限を付与する土台の架空メンバー
export const FIXTURE_TALK_OWNER_MEMBER_KEY = 'memberC';
