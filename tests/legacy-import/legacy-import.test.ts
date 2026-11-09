import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildMastersLookup,
  buildOutReportData,
  chunkArray,
  decodeUtf8Strict,
  detectLegacyForm,
  extractHostFromUrl,
  fetchAllWithRange,
  filterAlreadyImportedRecords,
  formatSafeTerminalOutput,
  parseCsvRecords,
  parseLegacyDate,
  parseLegacyJudge,
  parseLegacyMinutes,
  parseNamesMapping,
  processLegacyCsvFile,
  splitAndCleanNames,
  validateWriteSafetyFlags,
} from '../../scripts/legacy-import/core.mjs';

const MOCK_MEMBERS = [
  { id: 'id-leader-a', email: 'fixture-leader-a@example.test' },
  { id: 'id-member-a', email: 'fixture-member-a@example.test' },
  { id: 'id-member-b', email: 'fixture-member-b@example.test' },
  { id: 'id-leader-b', email: 'fixture-leader-b@example.test' },
  { id: 'id-member-c', email: 'fixture-member-c@example.test' },
  { id: 'id-mgr1', email: 'fixture-mgr-a@example.test' },
];

const MOCK_MASTERS = [
  { id: 'theme-apo', kind: 'memo_theme', name: 'アポ', is_active: true },
  { id: 'theme-list', kind: 'memo_theme', name: 'リスト', is_active: true },
  { id: 'theme-sales', kind: 'memo_theme', name: '営業', is_active: true },
  { id: 'theme-mgmt', kind: 'memo_theme', name: '管理', is_active: true },
  { id: 'theme-adopt', kind: 'memo_theme', name: '採用', is_active: true },
  { id: 'theme-attitude', kind: 'memo_theme', name: '姿勢', is_active: true },
  { id: 'theme-other', kind: 'memo_theme', name: 'その他', is_active: false },
  { id: 'kind-guidance', kind: 'memo_kind', name: '指摘・指導', is_active: true },
  { id: 'kind-praise', kind: 'memo_kind', name: 'ほめた', is_active: true },
];

describe('安全フラグ（--expect-host・--yes）と 1000件ページネーション・100件分割の検査', () => {
  it('URL からホスト名だけを取り出し、import と remove で --expect-host の不一致・未指定・--yes なしを止める', () => {
    const host = extractHostFromUrl('https://example-dev-db.supabase.co/rest/v1');
    expect(host).toBe('example-dev-db.supabase.co');
    expect(extractHostFromUrl('')).toBe('');

    // preview は --expect-host / --yes なしでも通る
    expect(
      validateWriteSafetyFlags({
        mode: 'preview',
        actualHost: host,
      }),
    ).toEqual({ ok: true });

    // import / remove で --expect-host がないときは止まる
    const noHost = validateWriteSafetyFlags({
      mode: 'import',
      actualHost: host,
      expectHost: '',
      yes: true,
    });
    expect(noHost.ok).toBe(false);

    // import / remove で --expect-host が違うホスト名のときは止まる
    const wrongHostImport = validateWriteSafetyFlags({
      mode: 'import',
      actualHost: host,
      expectHost: 'wrong-prod-db.supabase.co',
      yes: true,
    });
    expect(wrongHostImport.ok).toBe(false);

    const wrongHostRemove = validateWriteSafetyFlags({
      mode: 'remove',
      actualHost: host,
      expectHost: 'wrong-prod-db.supabase.co',
      yes: true,
    });
    expect(wrongHostRemove.ok).toBe(false);

    // --expect-host が合っていても --yes がないときは止まる
    const noYes = validateWriteSafetyFlags({
      mode: 'import',
      actualHost: host,
      expectHost: host,
      yes: false,
    });
    expect(noYes.ok).toBe(false);

    // 両方そろっていれば通る
    expect(
      validateWriteSafetyFlags({
        mode: 'import',
        actualHost: host,
        expectHost: host,
        yes: true,
      }),
    ).toEqual({ ok: true });
    expect(
      validateWriteSafetyFlags({
        mode: 'remove',
        actualHost: host,
        expectHost: host,
        yes: true,
      }),
    ).toEqual({ ok: true });
  });

  it('fetchAllWithRange が 1000件ずつ .range(from, to) で全ページを読み切り、chunkArray が 100件ずつに分ける', async () => {
    const totalRows = 2350;
    const allItems = Array.from({ length: totalRows }, (_, idx) => ({ id: idx + 1 }));
    const rangeCalls: Array<[number, number]> = [];

    const res = await fetchAllWithRange(async (from, to) => {
      rangeCalls.push([from, to]);
      return {
        data: allItems.slice(from, to + 1),
        error: null,
      };
    }, 1000);

    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(2350);
    expect(rangeCalls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);

    const ids = Array.from({ length: 250 }, (_, idx) => `id-${idx + 1}`);
    const chunks = chunkArray(ids, 100);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(100);
    expect(chunks[1]).toHaveLength(100);
    expect(chunks[2]).toHaveLength(50);
  });
});

describe('CSVパーサ・UTF-8 BOM・不正なUTF-8バイト列の検査', () => {
  it('クォート内の改行・カンマ・二重クォート("")・UTF-8 BOM を正しく読み取れる', () => {
    const csvWithBom =
      '\uFEFF列A,列B,列C\r\n' +
      '値1,"1行目,カンマつき\n2行目 ""引用"" あり",値3\r\n';

    const decoded = decodeUtf8Strict(Buffer.from(csvWithBom, 'utf8'));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    const records = parseCsvRecords(decoded.text);
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({
      rowNumber: 1,
      cells: ['列A', '列B', '列C'],
    });
    expect(records[1]).toEqual({
      rowNumber: 2,
      cells: ['値1', '1行目,カンマつき\n2行目 "引用" あり', '値3'],
    });
  });

  it('Shift_JIS など不正な UTF-8 バイト列は「UTF-8 で読めない」として止める', () => {
    const invalidBytes = new Uint8Array([0x82, 0xa0, 0x82, 0xa2]);
    const res = decodeUtf8Strict(invalidBytes);
    expect(res).toEqual({
      ok: false,
      reason: 'UTF-8 で読めない',
    });
  });
});

describe('形A・B・Cの見出し自動判定（形Cの頭2行の無視・右端の余分な列）', () => {
  it('形A・形B・形Cの見出しを左端から自動判定し、上の説明行や右端の余分な列（空列・列1）を許容する', () => {
    const formARecords = parseCsvRecords(
      '日付,上司,社員,気が付いた内容,項目,指導内容,今後の指導,行動,結果,,列1\n',
    );
    expect(detectLegacyForm(formARecords)?.form).toBe('A');

    const formBRecords = parseCsvRecords(
      '日時,時間帯,時間,名前,実行者,内容,詳細,結果,\n',
    );
    expect(detectLegacyForm(formBRecords)?.form).toBe('B');

    const formCRecords = parseCsvRecords(
      'タイトル行,,,,,,,,,\n' +
        '補足説明行,,,,,,,,,\n' +
        '日時,時間帯,時間,名前,実行者,内容,方法,詳細,引継ぎ事項,実践結果（FIXも）,列1\n',
    );
    const detectedC = detectLegacyForm(formCRecords);
    expect(detectedC?.form).toBe('C');
    expect(detectedC?.headerIndex).toBe(2);
  });
});

describe('日付・時間（分）・〇△×・名前の切り分けと対応表のテスト', () => {
  it('日付：YYYY/M/D・YYYY-M-D・YYYY年M月D日・時刻付き・Excel連続日数（30000〜60000）を変換し、年なしや範囲を弾く', () => {
    expect(parseLegacyDate('2025/4/9')).toBe('2025-04-09');
    expect(parseLegacyDate('2025-04-09')).toBe('2025-04-09');
    expect(parseLegacyDate('2025年4月9日')).toBe('2025-04-09');
    expect(parseLegacyDate('2025/5/10 14:30')).toBe('2025-05-10');
    expect(parseLegacyDate('45770')).toBe('2025-04-23');

    expect(parseLegacyDate('9/14')).toBeNull();
    expect(parseLegacyDate('7/27~7/31')).toBeNull();
    expect(parseLegacyDate('2025/7/27~7/31')).toBeNull();
    expect(parseLegacyDate('2025/2/30')).toBeNull();
    expect(parseLegacyDate('')).toBeNull();
  });

  it('時間（分）：数字・20分・0:15（時:分）を分数にし、空や読めない字は null にする', () => {
    expect(parseLegacyMinutes('20')).toBe(20);
    expect(parseLegacyMinutes('25分')).toBe(25);
    expect(parseLegacyMinutes('0:15')).toBe(15);
    expect(parseLegacyMinutes('1:30')).toBe(90);
    expect(parseLegacyMinutes('')).toBeNull();
    expect(parseLegacyMinutes('不明')).toBeNull();
  });

  it('〇△×：3種類の丸（〇・○・◯）を o、△ を d、×・✕・x・X を x、それ以外の字を null にする', () => {
    expect(parseLegacyJudge('〇')).toBe('o');
    expect(parseLegacyJudge('○')).toBe('o');
    expect(parseLegacyJudge('◯')).toBe('o');
    expect(parseLegacyJudge('△')).toBe('d');
    expect(parseLegacyJudge('×')).toBe('x');
    expect(parseLegacyJudge('✕')).toBe('x');
    expect(parseLegacyJudge('x')).toBe('x');
    expect(parseLegacyJudge('X')).toBe('x');
    expect(parseLegacyJudge('宿題')).toBeNull();
    expect(parseLegacyJudge('再ロープレ')).toBeNull();
    expect(parseLegacyJudge('')).toBeNull();
  });

  it('名前の対応表：見出し「元の名前,上席か対象か,名簿のメール」（後ろに列追加可）を必須とし、2表記・同姓別人を結び分ける', () => {
    expect(
      splitAndCleanNames('メンバーA（めんばーえー）、メンA , メンバーB・リーダーA／メンバーC'),
    ).toEqual(['メンバーA', 'メンA', 'メンバーB', 'リーダーA', 'メンバーC']);

    const namesPath = path.resolve('fixtures/legacy/names.csv');
    const namesBytes = fs.readFileSync(namesPath);
    const { nameToMemberId, errors } = parseNamesMapping(namesBytes, MOCK_MEMBERS);

    expect(errors).toEqual([]);
    expect(nameToMemberId.get('対象:メンバーA')).toBe('id-member-a');
    expect(nameToMemberId.get('対象:メンA')).toBe('id-member-a');
    expect(nameToMemberId.get('上席:架空イトウ')).toBe('id-leader-a');
    expect(nameToMemberId.get('対象:架空イトウ')).toBe('id-member-b');

    // 見出しが「メール」など計画4章と違う場合は止める
    const wrongHeaderRes = parseNamesMapping(
      '元の名前,上席か対象か,メール\nリーダーA,上席,fixture-leader-a@example.test\n',
      MOCK_MEMBERS,
    );
    expect(wrongHeaderRes.errors.map((e) => e.reason)).toEqual([
      '対応表の見出しが正しくない',
    ]);
  });
});

describe('fixtures/legacy/clean の4ファイルによる形A・B・Cの変換・外す行・二重取り込み防止', () => {
  const namesBytes = fs.readFileSync(path.resolve('fixtures/legacy/names.csv'));
  const { nameToMemberId } = parseNamesMapping(namesBytes, MOCK_MEMBERS);
  const { memoThemeMap, guidanceKindId } = buildMastersLookup(MOCK_MASTERS);

  it('形A（01_form_a_team1.csv・UTF-8 BOMつき）：kind_id は常に null、今後の指導は「今後の指導：…」で改行結合、停止中テーマの引き当て、4種類の外す行が動く', () => {
    const bytes = fs.readFileSync(
      path.resolve('fixtures/legacy/clean/01_form_a_team1.csv'),
    );
    const res = processLegacyCsvFile({
      fileIndex: 1,
      fileName: '01_form_a_team1.csv',
      bytes,
      nameToMemberId,
      memoThemeMap,
      guidanceKindId,
    });

    expect(res.form).toBe('A');
    expect(res.errors).toEqual([]);
    expect(res.skippedRows.map((s) => s.reason)).toEqual([
      '同じファイル内の重複行',
      'テストの行',
      '中身が空',
      '見出しの行の重複',
    ]);
    expect(res.memos).toHaveLength(7);

    // 形A の kind_id は指導内容があっても常に null（2026-11-09 本人の選択）
    for (const m of res.memos) {
      expect(m.kind_id).toBeNull();
    }

    // 1件目：指導内容＋今後の指導の改行結合（「今後の指導：…」、【】は使わない）、〇→o、○→o
    expect(res.memos[0].guidance).toBe(
      '架空の指導：受付突破の切り返しを練習\n今後の指導：次回ロープレで再確認',
    );
    expect(res.memos[0].action_check).toBe('o');
    expect(res.memos[0].result_check).toBe('o');

    // 3件目：架空イトウ（上席＝リーダーA、対象＝メンバーB）、指導内容が空で今後の指導のみ
    expect(res.memos[2].created_by).toBe('id-leader-a');
    expect(res.memos[2].target_member_ids).toEqual(['id-member-b']);
    expect(res.memos[2].guidance).toBe('今後の指導：架空の今後の指導：質問票を手元に置く');

    // 4件目：複数人（メンバーA、メンバーB）
    expect(res.memos[3].target_member_ids).toEqual(['id-member-a', 'id-member-b']);

    // 7件目：停止中マスタ（その他）も引き当たり、セル内改行とカンマが保持される
    expect(res.memos[6].theme_id).toBe('theme-other');
    expect(res.memos[6].noticed).toContain('セル内改行と,カンマを含む気づき\n2行目の文章');
  });

  it('形B（03_form_b.csv）：アポ・営業・営業研修のロープレ振り分け、pass_result は常に null、研修の theme は「研修：」＋詳細の頭30文字（空なら「研修」）', () => {
    const bytes = fs.readFileSync(path.resolve('fixtures/legacy/clean/03_form_b.csv'));
    const res = processLegacyCsvFile({
      fileIndex: 3,
      fileName: '03_form_b.csv',
      bytes,
      nameToMemberId,
      memoThemeMap,
      guidanceKindId,
    });

    expect(res.form).toBe('B');
    expect(res.errors).toEqual([]);
    expect(res.skippedRows.map((s) => s.reason)).toEqual([
      '同じファイル内の重複行',
      '中身が空',
      'テストの行',
      '見出しの行の重複',
    ]);

    // ロープレ：1人×4行 + 2人同時×1行 + 1人×1行 = 計7件
    expect(res.roleplays).toHaveLength(7);
    expect(res.roleplays[0].kind).toBe('apo');
    expect(res.roleplays[0].theme_id).toBeNull();
    expect(res.roleplays[0].time_slot).toBeNull();
    expect(res.roleplays[1].kind).toBe('sales');
    expect(res.roleplays[1].minutes).toBe(25);
    expect(res.roleplays[2].minutes).toBe(15); // "0:15" -> 15分
    // 内容「営業研修」はロープレ（sales）になる
    expect(res.roleplays[5].kind).toBe('sales');
    // ロープレの pass_result は 〇△× があっても常に null（結果は legacy_source にだけ残す）
    for (const rp of res.roleplays) {
      expect(rp.pass_result).toBeNull();
      expect(rp.note).toBeNull();
    }
    expect(res.roleplays[0].legacy_source.values['結果']).toBe('〇');
    expect(res.roleplays[5].legacy_source.values['結果']).toBe('再ロープレ');

    // 研修：2件（theme は「研修：」＋詳細の頭30文字）
    expect(res.seminars).toHaveLength(2);
    const firstDetail =
      '架空の昔研修B1：アポ導入と,質問の流れを確認する30文字超えの長い研修詳細テキスト\n2行目のまとめ';
    expect(res.seminars[0].theme).toBe(`研修：${firstDetail.slice(0, 30)}`);
    expect(res.seminars[0].theme).toHaveLength(3 + 30);
    expect(res.seminars[0].participant_member_ids).toEqual([
      'id-member-a',
      'id-member-b',
      'id-leader-a',
    ]);
    expect(res.seminars[1].theme).toBe('研修：架空の昔研修B2：商談ロールプレイ全体会');

    // 詳細が空の研修は theme が「研修」になることを確かめる
    const emptyDetailSeminarCsv =
      '日時,時間帯,時間,名前,実行者,内容,詳細,結果\n' +
      '2025/5/20,,30,メンバーA,リーダーA,研修,,\n';
    const emptyDetailRes = processLegacyCsvFile({
      fileIndex: 9,
      fileName: 'empty_detail_seminar.csv',
      bytes: Buffer.from(emptyDetailSeminarCsv, 'utf8'),
      nameToMemberId,
      memoThemeMap,
      guidanceKindId,
    });
    expect(emptyDetailRes.seminars).toHaveLength(1);
    expect(emptyDetailRes.seminars[0].theme).toBe('研修');
  });

  it('形C（04_form_c.csv）：頭2行の無視、ロープレの next_homework＝引継ぎ事項・note＝null・pass_result＝null、研修、FIXの noticed＝詳細・guidance＝引継ぎ事項＋実践結果', () => {
    const bytes = fs.readFileSync(path.resolve('fixtures/legacy/clean/04_form_c.csv'));
    const res = processLegacyCsvFile({
      fileIndex: 4,
      fileName: '04_form_c.csv',
      bytes,
      nameToMemberId,
      memoThemeMap,
      guidanceKindId,
    });

    expect(res.form).toBe('C');
    expect(res.errors).toEqual([]);
    expect(res.skippedRows).toHaveLength(5);

    // ロープレ：1人×4行 + 2人×1行 + 1人×1行 = 7件
    expect(res.roleplays).toHaveLength(7);
    expect(res.roleplays[0].kind).toBe('apo');
    expect(res.roleplays[0].next_homework).toBe('次回は導入30秒以内を意識');
    expect(res.roleplays[3].kind).toBe('sales'); // 営業研修 -> sales
    expect(res.roleplays[3].next_homework).toBe('次回再チェック');
    expect(res.roleplays[4].next_homework).toBeNull(); // 引継ぎ事項が空なら null
    for (const rp of res.roleplays) {
      expect(rp.pass_result).toBeNull();
      expect(rp.note).toBeNull();
    }
    expect(res.roleplays[3].legacy_source.values['実践結果（FIXも）']).toBe(
      '宿題：事例を3つ暗記',
    );

    // 研修：1件
    expect(res.seminars).toHaveLength(1);
    expect(res.seminars[0].theme).toBe('架空の昔研修テーマC1');
    expect(res.seminars[0].content).toBe(
      '架空の昔研修C1：切り返しトーク基礎\n配布資料を各自復習',
    );

    // FIX：subordinate_memos に1件（noticed＝詳細、guidance＝「引継ぎ事項：…」「実践結果：…」の改行結合）
    expect(res.memos).toHaveLength(1);
    expect(res.memos[0].theme_id).toBeNull();
    expect(res.memos[0].kind_id).toBe('kind-guidance');
    expect(res.memos[0].noticed).toBe('架空の昔FIXメモC1：通話姿勢と,メモ取りの改善');
    expect(res.memos[0].guidance).toBe(
      '引継ぎ事項：次回架電時に確認\n実践結果：実践済み',
    );

    // FIX で片方または両方が空のとき、空のものは書かないことを確かめる
    const partialFixCsv =
      '日時,時間帯,時間,名前,実行者,内容,方法,詳細,引継ぎ事項,実践結果（FIXも）\n' +
      '2025/6/11,,,メンバーA,リーダーA,アポ,FIX,詳細のみ,,\n' +
      '2025/6/12,,,メンバーA,リーダーA,アポ,FIX,,引継ぎのみ,\n' +
      '2025/6/13,,,メンバーA,リーダーA,アポ,FIX,,,実践結果のみ\n';
    const partialFixRes = processLegacyCsvFile({
      fileIndex: 10,
      fileName: 'partial_fix.csv',
      bytes: Buffer.from(partialFixCsv, 'utf8'),
      nameToMemberId,
      memoThemeMap,
      guidanceKindId,
    });
    expect(partialFixRes.memos).toHaveLength(3);
    expect(partialFixRes.memos[0].noticed).toBe('詳細のみ');
    expect(partialFixRes.memos[0].guidance).toBe('');
    expect(partialFixRes.memos[1].noticed).toBe('');
    expect(partialFixRes.memos[1].guidance).toBe('引継ぎ事項：引継ぎのみ');
    expect(partialFixRes.memos[2].noticed).toBe('');
    expect(partialFixRes.memos[2].guidance).toBe('実践結果：実践結果のみ');
  });

  it('二重取り込み防止：すでに入っている file + row（roleplays は + member_id）は飛ばし、2回目は新規0件になる', () => {
    const bytesB = fs.readFileSync(path.resolve('fixtures/legacy/clean/03_form_b.csv'));
    const resB = processLegacyCsvFile({
      fileIndex: 3,
      fileName: '03_form_b.csv',
      bytes: bytesB,
      nameToMemberId,
      memoThemeMap,
      guidanceKindId,
    });

    const existingMemoKeys = new Set<string>();
    const existingRoleplayKeys = new Set(
      resB.roleplays.map(
        (r) => `${r.legacy_source.file}:${r.legacy_source.row}:${r.member_id}`,
      ),
    );
    const existingSeminarKeys = new Set(
      resB.seminars.map((s) => `${s.legacy_source.file}:${s.legacy_source.row}`),
    );

    const secondRun = filterAlreadyImportedRecords({
      memos: resB.memos,
      roleplays: resB.roleplays,
      seminars: resB.seminars,
      existingMemoKeys,
      existingRoleplayKeys,
      existingSeminarKeys,
    });

    expect(secondRun.newRoleplays).toHaveLength(0);
    expect(secondRun.existingRoleplayCount).toBe(resB.roleplays.length);
    expect(secondRun.newSeminars).toHaveLength(0);
    expect(secondRun.existingSeminarCount).toBe(resB.seminars.length);
  });
});

describe('止める理由の全種類検査・--out ファイルへの未登録名記録・ターミナル出力への個人情報非表示', () => {
  const namesBytes = fs.readFileSync(path.resolve('fixtures/legacy/names.csv'));
  const { nameToMemberId } = parseNamesMapping(namesBytes, MOCK_MEMBERS);
  const { memoThemeMap, guidanceKindId } = buildMastersLookup(MOCK_MASTERS);

  it('対応表の重複・名簿にないメール・マスタの不備をすべて検出する', () => {
    const badNamesBytes = fs.readFileSync(
      path.resolve('fixtures/legacy/errors/bad_names.csv'),
    );
    const badNamesRes = parseNamesMapping(badNamesBytes, MOCK_MEMBERS);
    expect(badNamesRes.errors.map((e) => e.reason)).toEqual([
      '対応表に同じ組（元の名前・上席か対象か）が2行ある',
      '対応表のメールが名簿にない',
    ]);

    const noGuidanceMasters = buildMastersLookup([
      { id: 't1', kind: 'memo_theme', name: 'アポ' },
    ]);
    expect(noGuidanceMasters.errors.map((e) => e.reason)).toEqual([
      '一覧に「指摘・指導」の種類がない・同じ名前の一覧が2つある',
    ]);

    const dupThemeMasters = buildMastersLookup([
      { id: 't1', kind: 'memo_theme', name: 'アポ' },
      { id: 't2', kind: 'memo_theme', name: 'アポ' },
      { id: 'k1', kind: 'memo_kind', name: '指摘・指導' },
    ]);
    expect(dupThemeMasters.errors.map((e) => e.reason)).toEqual([
      '一覧に「指摘・指導」の種類がない・同じ名前の一覧が2つある',
    ]);
  });

  it('形A・B・CのエラーCSV（上司・実行者が2人以上、AP・クローザーの拒否を含む）を検出し、--out には元の名前と上席/対象を書き、ターミナルには出さない', () => {
    const errA = processLegacyCsvFile({
      fileIndex: 1,
      fileName: 'secret_person_name_A.csv',
      bytes: fs.readFileSync(path.resolve('fixtures/legacy/errors/01_form_a_errors.csv')),
      nameToMemberId,
      memoThemeMap,
      guidanceKindId,
    });
    const errB = processLegacyCsvFile({
      fileIndex: 2,
      fileName: 'secret_person_name_B.csv',
      bytes: fs.readFileSync(path.resolve('fixtures/legacy/errors/02_form_b_errors.csv')),
      nameToMemberId,
      memoThemeMap,
      guidanceKindId,
    });
    const errC = processLegacyCsvFile({
      fileIndex: 3,
      fileName: 'secret_person_name_C.csv',
      bytes: fs.readFileSync(path.resolve('fixtures/legacy/errors/03_form_c_errors.csv')),
      nameToMemberId,
      memoThemeMap,
      guidanceKindId,
    });

    expect(errA.errors.map((e) => e.reason)).toEqual([
      '読めない日付',
      '読めない日付',
      '対応表にない名前',
      '上司・実行者・社員・名前が空',
      '部下メモのテーマが一覧にない',
      '上司・実行者が2人以上',
    ]);
    expect(errB.errors.map((e) => e.reason)).toEqual([
      '内容・方法が振り分けの表にない',
      '上司・実行者・社員・名前が空',
    ]);
    // 形Cで「面談」「AP」「クローザー」がすべて「内容・方法が振り分けの表にない」になる
    expect(errC.errors.map((e) => e.reason)).toEqual([
      '内容・方法が振り分けの表にない',
      '内容・方法が振り分けの表にない',
      '内容・方法が振り分けの表にない',
    ]);

    // --out に書き出すデータには、「対応表にない名前」の行ごとに元の名前と上席か対象かが入る
    const outReport = buildOutReportData({
      mode: 'preview',
      globalErrors: [],
      fileResults: [errA, errB, errC],
      counts: {
        newMemos: 0,
        existingMemoCount: 0,
        newRoleplays: 0,
        existingRoleplayCount: 0,
        newSeminars: 0,
        existingSeminarCount: 0,
      },
    });
    expect(outReport.unmappedNames).toEqual([
      {
        fileIndex: 1,
        fileName: 'secret_person_name_A.csv',
        rowNumber: 4,
        originalName: '架空未登録タロウ',
        roleKind: '対象',
      },
    ]);

    const terminalOutput = formatSafeTerminalOutput({
      mode: 'preview',
      fileSummaries: [errA, errB, errC],
      globalErrors: [],
      counts: {
        newMemos: 0,
        existingMemoCount: 0,
        newRoleplays: 0,
        existingRoleplayCount: 0,
        newSeminars: 0,
        existingSeminarCount: 0,
      },
    });

    expect(terminalOutput).toContain('ファイル1（形A）');
    expect(terminalOutput).toContain('ファイル1 の 2行目：読めない日付');
    expect(terminalOutput).toContain('ファイル1 の 4行目：対応表にない名前');
    expect(terminalOutput).toContain('ファイル1 の 7行目：上司・実行者が2人以上');
    expect(terminalOutput).toContain('ファイル2 の 2行目：内容・方法が振り分けの表にない');
    expect(terminalOutput).toContain('ファイル3 の 3行目：内容・方法が振り分けの表にない');
    // ファイル名やCSV内の名前・本文が一切ターミナル出力に含まれないこと
    expect(terminalOutput).not.toContain('secret_person_name');
    expect(terminalOutput).not.toContain('架空未登録タロウ');
    expect(terminalOutput).not.toContain('リーダーA');
    expect(terminalOutput).not.toContain('エラー行');
  });
});
