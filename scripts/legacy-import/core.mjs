// @ts-check

/**
 * カルテ第1版④：過去の記録の取り込み（純粋な計算モジュール）
 * DB接続やファイルI/Oを持たず、バイト列・文字列・名簿・マスタを受け取って
 * 判定・変換・集計・ターミナル表示文・--out 用詳細データの組み立てを行う。
 */

export const FORM_A_HEADERS = [
  '日付',
  '上司',
  '社員',
  '気が付いた内容',
  '項目',
  '指導内容',
  '今後の指導',
  '行動',
  '結果',
];

export const FORM_B_HEADERS = [
  '日時',
  '時間帯',
  '時間',
  '名前',
  '実行者',
  '内容',
  '詳細',
  '結果',
];

export const FORM_C_HEADERS = [
  '日時',
  '時間帯',
  '時間',
  '名前',
  '実行者',
  '内容',
  '方法',
  '詳細',
  '引継ぎ事項',
  '実践結果（FIXも）',
];

export const NAMES_CSV_HEADERS = ['元の名前', '上席か対象か', '名簿のメール'];

/**
 * 接続先 URL からホスト名だけを取り出す。
 *
 * @param {string | null | undefined} rawUrl
 * @returns {string}
 */
export function extractHostFromUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    return new URL(rawUrl.trim()).hostname;
  } catch {
    return '';
  }
}

/**
 * import / remove 実行時の安全フラグ（--expect-host と --yes）を検査する。
 *
 * @param {{
 *   mode: string,
 *   actualHost: string,
 *   expectHost?: string,
 *   yes?: boolean,
 * }} params
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateWriteSafetyFlags(params) {
  const { mode, actualHost, expectHost, yes } = params;
  if (mode !== 'import' && mode !== 'remove') {
    return { ok: true };
  }
  if (!actualHost) {
    return {
      ok: false,
      reason: '接続先 URL からホスト名を取得できません。処理を中止します。',
    };
  }
  const normalizedExpect = (expectHost ?? '').trim();
  if (!normalizedExpect || normalizedExpect !== actualHost) {
    return {
      ok: false,
      reason: `--expect-host が接続先ホスト名と一致しません（指定: ${normalizedExpect || 'なし'}, 接続先: ${actualHost}）。書き込み・削除を行わずに終了します。`,
    };
  }
  if (!yes) {
    return {
      ok: false,
      reason: '--yes が指定されていません。書き込み・削除を行わずに終了します。',
    };
  }
  return { ok: true };
}

/**
 * 1000件ずつのページネーション（.range(from, to)）で全件を取得する汎用ヘルパー。
 *
 * @template T
 * @param {(from: number, to: number) => Promise<{ data: T[] | null, error: { code?: string, message?: string } | null }>} fetchPage
 * @param {number} [pageSize=1000]
 * @returns {Promise<{ data: T[], error: { code?: string, message?: string } | null }>}
 */
export async function fetchAllWithRange(fetchPage, pageSize = 1000) {
  /** @type {T[]} */
  const allRows = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) {
      return { data: [], error };
    }
    const batch = data ?? [];
    allRows.push(...batch);
    if (batch.length < pageSize) {
      break;
    }
    from += pageSize;
  }

  return { data: allRows, error: null };
}

/**
 * 配列を指定件数（既定100件）ずつの塊に分割する。
 *
 * @template T
 * @param {T[]} items
 * @param {number} [chunkSize=100]
 * @returns {T[][]}
 */
export function chunkArray(items, chunkSize = 100) {
  /** @type {T[][]} */
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * バイト列を UTF-8 として厳密にデコードし、先頭の BOM (\uFEFF) を取り除く。
 * Shift_JIS など不正な UTF-8 バイト列が含まれる場合は ok: false を返す。
 *
 * @param {Uint8Array | Buffer} bytes
 * @returns {{ ok: true, text: string } | { ok: false, reason: 'UTF-8 で読めない' }}
 */
export function decodeUtf8Strict(bytes) {
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let text = decoder.decode(bytes);
    if (text.startsWith('\uFEFF')) {
      text = text.slice(1);
    }
    return { ok: true, text };
  } catch {
    return { ok: false, reason: 'UTF-8 で読めない' };
  }
}

/**
 * クォート内の改行・カンマ・二重クォート ("") に対応した自前 CSV パーサ。
 * 各行にファイル内の 1 始まりの行番号（レコード番号）を付けて返す。
 *
 * @param {string} text
 * @returns {Array<{ rowNumber: number, cells: string[] }>}
 */
export function parseCsvRecords(text) {
  const normalized = text.startsWith('\uFEFF') ? text.slice(1) : text;
  if (normalized.length === 0) {
    return [];
  }

  /** @type {Array<{ rowNumber: number, cells: string[] }>} */
  const records = [];
  /** @type {string[]} */
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;
  let i = 0;

  while (i < normalized.length) {
    const ch = normalized[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < normalized.length && normalized[i + 1] === '"') {
          currentCell += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        currentCell += ch;
        i += 1;
      }
      continue;
    }

    if (ch === '"' && currentCell.length === 0) {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === ',') {
      currentRow.push(currentCell);
      currentCell = '';
      i += 1;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      currentRow.push(currentCell);
      currentCell = '';
      records.push({
        rowNumber: records.length + 1,
        cells: currentRow,
      });
      currentRow = [];
      if (ch === '\r' && i + 1 < normalized.length && normalized[i + 1] === '\n') {
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    currentCell += ch;
    i += 1;
  }

  // ファイル末尾に改行がない最終行を追加（末尾の改行直後の空状態は追加しない）
  if (currentRow.length > 0 || currentCell.length > 0) {
    currentRow.push(currentCell);
    records.push({
      rowNumber: records.length + 1,
      cells: currentRow,
    });
  }

  return records;
}

/**
 * 行の左端から期待する見出し配列と一致するか判定する。
 * 右端に余分な空列や「列1」などが付いていてもよい。
 *
 * @param {string[]} cells
 * @param {string[]} expectedHeaders
 * @returns {boolean}
 */
export function matchesHeaderPrefix(cells, expectedHeaders) {
  if (cells.length < expectedHeaders.length) {
    return false;
  }
  for (let i = 0; i < expectedHeaders.length; i += 1) {
    if ((cells[i] ?? '').trim() !== expectedHeaders[i]) {
      return false;
    }
  }
  return true;
}

/**
 * CSV のレコード一覧から見出しの行と形（A / B / C）を自動で見つける。
 *
 * @param {Array<{ rowNumber: number, cells: string[] }>} records
 * @returns {{ form: 'A' | 'B' | 'C', headerIndex: number, headers: string[] } | null}
 */
export function detectLegacyForm(records) {
  for (let idx = 0; idx < records.length; idx += 1) {
    const { cells } = records[idx];
    if (matchesHeaderPrefix(cells, FORM_A_HEADERS)) {
      return { form: 'A', headerIndex: idx, headers: FORM_A_HEADERS };
    }
    if (matchesHeaderPrefix(cells, FORM_C_HEADERS)) {
      return { form: 'C', headerIndex: idx, headers: FORM_C_HEADERS };
    }
    if (matchesHeaderPrefix(cells, FORM_B_HEADERS)) {
      return { form: 'B', headerIndex: idx, headers: FORM_B_HEADERS };
    }
  }
  return null;
}

/**
 * 名前欄の文字列から個人名の配列を取り出す。
 * 「、」「,」「・」「／」で分割し、前後の空白と後ろの丸カッコのふりがな（（...）または (...)）を落とす。
 *
 * @param {string | null | undefined} raw
 * @returns {string[]}
 */
export function splitAndCleanNames(raw) {
  if (!raw) return [];
  return raw
    .split(/[、,・／]/)
    .map((part) =>
      part
        .replace(/[\s\u3000]+/g, ' ')
        .trim()
        .replace(/[（(][^）)]*[）)]\s*$/, '')
        .trim(),
    )
    .filter((name) => name.length > 0);
}

/**
 * 日付文字列を YYYY-MM-DD に変換する。
 * - YYYY/M/D, YYYY-M-D, YYYY年M月D日（後ろに時刻が付いていてもよい）
 * - Excel の連続日数の整数（30000〜60000、1899-12-30 からの日数）
 * - 年がない「9/14」や範囲「7/27~7/31」などは null を返す。
 *
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
export function parseLegacyDate(raw) {
  if (!raw) return null;
  const trimmed = raw.replace(/\u3000/g, ' ').trim();
  if (!trimmed) return null;

  // 範囲表現（~ や 〜 や ～）が含まれる場合は不可
  if (/[~〜～]/.test(trimmed)) {
    return null;
  }

  // Excel シリアル値（30000〜60000 の整数）
  if (/^\d{5}$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (serial >= 30000 && serial <= 60000) {
      const epochMs = Date.UTC(1899, 11, 30) + serial * 86_400_000;
      const dt = new Date(epochMs);
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dt.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return null;
  }

  // 後ろに時刻（例: "2025/4/9 10:00"）が付いている場合は先頭の日付部分だけを取り出す
  const tokens = trimmed.split(/\s+/);
  if (tokens.length > 2) {
    return null;
  }
  if (tokens.length === 2 && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(tokens[1])) {
    return null;
  }
  const datePart = tokens[0];

  const slashOrHyphen = datePart.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  const jpFormat = datePart.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  const matched = slashOrHyphen ?? jpFormat;
  if (!matched) {
    return null;
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);

  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const checkDate = new Date(Date.UTC(year, month - 1, day));
  if (
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() !== month - 1 ||
    checkDate.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 時間欄の文字列を分数（整数）に変換する。
 * - 数字のみ ("20") -> 20
 * - "20分" -> 20
 * - "0:15" / "1:30" (時:分) -> 15 / 90
 * - 空や読めない字 -> null
 *
 * @param {string | null | undefined} raw
 * @returns {number | null}
 */
export function parseLegacyMinutes(raw) {
  if (!raw) return null;
  const trimmed = raw.replace(/\u3000/g, ' ').trim();
  if (!trimmed) return null;

  const numMatch = trimmed.match(/^(\d+)\s*分?$/);
  if (numMatch) {
    return Number(numMatch[1]);
  }

  const hmMatch = trimmed.match(/^(\d+):(\d{1,2})$/);
  if (hmMatch) {
    const hours = Number(hmMatch[1]);
    const mins = Number(hmMatch[2]);
    if (mins < 60) {
      return hours * 60 + mins;
    }
  }

  return null;
}

/**
 * 〇△×の文字列を 'o' | 'd' | 'x' | null に変換する。
 * - 〇 (U+3007), ○ (U+25CB), ◯ (U+25EF) -> 'o'
 * - △ (U+25B3), ▲ -> 'd'
 * - × (U+00D7), ✕ (U+2715), x, X, ✗ -> 'x'
 * - それ以外 -> null
 *
 * @param {string | null | undefined} raw
 * @returns {'o' | 'd' | 'x' | null}
 */
export function parseLegacyJudge(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed === '〇' || trimmed === '○' || trimmed === '◯') {
    return 'o';
  }
  if (trimmed === '△') {
    return 'd';
  }
  if (trimmed === '×' || trimmed === '✕' || trimmed === 'x' || trimmed === 'X') {
    return 'x';
  }
  return null;
}

/**
 * names.csv を読み取り、対応表と停止エラーを返す。
 * 見出しは「元の名前,上席か対象か,名簿のメール」（後ろに備考などの列が足されていてもよい）。
 *
 * @param {Uint8Array | Buffer | string} input
 * @param {Array<{ id: string, email: string }>} members
 */
export function parseNamesMapping(input, members) {
  /** @type {Array<{ sourceLabel: string, rowNumber: number | null, reason: string }>} */
  const errors = [];
  /** @type {Map<string, string>} key: `${role}:${rawName}` -> memberId */
  const nameToMemberId = new Map();

  let text = '';
  if (typeof input === 'string') {
    text = input.startsWith('\uFEFF') ? input.slice(1) : input;
  } else {
    const decoded = decodeUtf8Strict(input);
    if (!decoded.ok) {
      errors.push({
        sourceLabel: '対応表',
        rowNumber: null,
        reason: 'UTF-8 で読めない',
      });
      return { nameToMemberId, errors };
    }
    text = decoded.text;
  }

  const records = parseCsvRecords(text);
  if (records.length === 0 || !matchesHeaderPrefix(records[0].cells, NAMES_CSV_HEADERS)) {
    errors.push({
      sourceLabel: '対応表',
      rowNumber: 1,
      reason: '対応表の見出しが正しくない',
    });
    return { nameToMemberId, errors };
  }

  const emailToMemberId = new Map(
    members.map((m) => [m.email.trim().toLowerCase(), m.id]),
  );

  /** @type {Set<string>} */
  const seenPairs = new Set();

  for (let i = 1; i < records.length; i += 1) {
    const { rowNumber, cells } = records[i];
    const rawName = (cells[0] ?? '')
      .replace(/[\s\u3000]+/g, ' ')
      .trim()
      .replace(/[（(][^）)]*[）)]\s*$/, '')
      .trim();
    const roleKind = (cells[1] ?? '').trim();
    const email = (cells[2] ?? '').trim().toLowerCase();

    if (!rawName && !roleKind && !email) {
      continue;
    }

    if (roleKind !== '上席' && roleKind !== '対象') {
      errors.push({
        sourceLabel: '対応表',
        rowNumber,
        reason: '対応表の上席・対象の区分が正しくない',
      });
      continue;
    }

    const pairKey = `${roleKind}:${rawName}`;
    if (seenPairs.has(pairKey)) {
      errors.push({
        sourceLabel: '対応表',
        rowNumber,
        reason: '対応表に同じ組（元の名前・上席か対象か）が2行ある',
      });
    } else {
      seenPairs.add(pairKey);
    }

    const memberId = emailToMemberId.get(email);
    if (!memberId) {
      errors.push({
        sourceLabel: '対応表',
        rowNumber,
        reason: '対応表のメールが名簿にない',
      });
    } else {
      nameToMemberId.set(pairKey, memberId);
    }
  }

  return { nameToMemberId, errors };
}

/**
 * masters 表から部下メモのテーマ（停止中も含む）と種類（指摘・指導）を引き当てる辞書を作る。
 *
 * @param {Array<{ id: string, kind: string, name: string, is_active?: boolean }>} masters
 */
export function buildMastersLookup(masters) {
  /** @type {Array<{ sourceLabel: string, rowNumber: number | null, reason: string }>} */
  const errors = [];
  /** @type {Map<string, string>} */
  const memoThemeMap = new Map();
  let duplicateTheme = false;

  for (const m of masters) {
    if (m.kind === 'memo_theme') {
      const name = m.name.trim();
      if (memoThemeMap.has(name)) {
        duplicateTheme = true;
      } else {
        memoThemeMap.set(name, m.id);
      }
    }
  }

  const guidanceKinds = masters.filter(
    (m) => m.kind === 'memo_kind' && m.name.trim() === '指摘・指導',
  );

  if (guidanceKinds.length !== 1 || duplicateTheme) {
    errors.push({
      sourceLabel: 'マスタ',
      rowNumber: null,
      reason: '一覧に「指摘・指導」の種類がない・同じ名前の一覧が2つある',
    });
  }

  return {
    memoThemeMap,
    guidanceKindId: guidanceKinds.length === 1 ? guidanceKinds[0].id : null,
    errors,
  };
}

/**
 * 1つの CSV ファイルを検査・変換する。
 *
 * @param {{
 *   fileIndex: number,
 *   fileName: string,
 *   bytes: Uint8Array | Buffer,
 *   nameToMemberId: Map<string, string>,
 *   memoThemeMap: Map<string, string>,
 *   guidanceKindId: string | null,
 * }} params
 */
export function processLegacyCsvFile(params) {
  const {
    fileIndex,
    fileName,
    bytes,
    nameToMemberId,
    memoThemeMap,
    guidanceKindId,
  } = params;

  const fileLabelBase = `ファイル${fileIndex}`;
  /**
   * @type {Array<{
   *   sourceLabel: string,
   *   rowNumber: number | null,
   *   reason: string,
   *   fileName: string,
   *   originalName?: string,
   *   roleKind?: '上席' | '対象',
   * }>}
   */
  const errors = [];
  /** @type {Array<{ rowNumber: number, reason: string }>} */
  const skippedRows = [];

  /** @type {Array<{
   *   date: string,
   *   created_by: string,
   *   theme_id: string | null,
   *   kind_id: string | null,
   *   noticed: string,
   *   guidance: string,
   *   action_check: 'o' | 'd' | 'x' | null,
   *   result_check: 'o' | 'd' | 'x' | null,
   *   submitted_at: string,
   *   is_legacy: true,
   *   legacy_source: { file: string, row: number, values: Record<string, string> },
   *   target_member_ids: string[],
   * }>} */
  const memos = [];

  /** @type {Array<{
   *   date: string,
   *   runner_member_id: string,
   *   member_id: string,
   *   time_slot: null,
   *   kind: 'apo' | 'sales',
   *   theme_id: null,
   *   minutes: number | null,
   *   pass_result: null,
   *   fixed_point: string,
   *   next_homework: string | null,
   *   note: null,
   *   submitted_at: string,
   *   is_legacy: true,
   *   legacy_source: { file: string, row: number, values: Record<string, string> },
   * }>} */
  const roleplays = [];

  /** @type {Array<{
   *   date: string,
   *   theme: string,
   *   lecturer: string,
   *   minutes: number,
   *   content: string,
   *   created_by: string,
   *   is_legacy: true,
   *   legacy_source: { file: string, row: number, values: Record<string, string> },
   *   participant_member_ids: string[],
   * }>} */
  const seminars = [];

  const decoded = decodeUtf8Strict(bytes);
  if (!decoded.ok) {
    errors.push({
      sourceLabel: fileLabelBase,
      rowNumber: null,
      reason: 'UTF-8 で読めない',
      fileName,
    });
    return {
      fileIndex,
      fileName,
      form: null,
      fileLabel: `${fileLabelBase}（不明）`,
      targetRowCount: 0,
      skippedRows,
      errors,
      memos,
      roleplays,
      seminars,
    };
  }

  const records = parseCsvRecords(decoded.text);
  const detected = detectLegacyForm(records);
  if (!detected) {
    errors.push({
      sourceLabel: fileLabelBase,
      rowNumber: 1,
      reason: '見出しの行が見つからない',
      fileName,
    });
    return {
      fileIndex,
      fileName,
      form: null,
      fileLabel: `${fileLabelBase}（不明）`,
      targetRowCount: 0,
      skippedRows,
      errors,
      memos,
      roleplays,
      seminars,
    };
  }

  const { form, headerIndex, headers } = detected;
  const fileLabel = `${fileLabelBase}（形${form}）`;
  /** @type {Set<string>} */
  const seenRowFingerprints = new Set();
  let targetRowCount = 0;

  for (let idx = headerIndex + 1; idx < records.length; idx += 1) {
    const { rowNumber, cells } = records[idx];
    const headerSlice = headers.map((_, colIdx) => cells[colIdx] ?? '');

    // 1. 途中に同じ見出しの行がもう一度出てきた行 -> 外して進む
    if (matchesHeaderPrefix(cells, headers)) {
      skippedRows.push({ rowNumber, reason: '見出しの行の重複' });
      continue;
    }

    /** @type {Record<string, string>} */
    const values = {};
    headers.forEach((h, colIdx) => {
      values[h] = cells[colIdx] ?? '';
    });

    // 2. 中身が空の行 -> 外して進む
    if (form === 'A') {
      const noticed = (values['気が付いた内容'] ?? '').trim();
      const guidance = (values['指導内容'] ?? '').trim();
      const futureGuidance = (values['今後の指導'] ?? '').trim();
      if (!noticed && !guidance && !futureGuidance) {
        skippedRows.push({ rowNumber, reason: '中身が空' });
        continue;
      }
    } else if (form === 'B') {
      const dt = (values['日時'] ?? '').trim();
      const nm = (values['名前'] ?? '').trim();
      const detail = (values['詳細'] ?? '').trim();
      if (!dt && !nm && !detail) {
        skippedRows.push({ rowNumber, reason: '中身が空' });
        continue;
      }
    } else {
      const dt = (values['日時'] ?? '').trim();
      const nm = (values['名前'] ?? '').trim();
      const detail = (values['詳細'] ?? '').trim();
      const method = (values['方法'] ?? '').trim();
      const handover = (values['引継ぎ事項'] ?? '').trim();
      const practiceRes = (values['実践結果（FIXも）'] ?? '').trim();
      if ((!dt && !nm && !detail) || (method === 'FIX' && !detail && !handover && !practiceRes)) {
        skippedRows.push({ rowNumber, reason: '中身が空' });
        continue;
      }
    }

    // 3. 社員または名前が「テスト」の行 -> 外して進む
    const rawTargetCell = form === 'A' ? values['社員'] : values['名前'];
    const targetNames = splitAndCleanNames(rawTargetCell);
    if (
      (rawTargetCell ?? '').trim() === 'テスト' ||
      targetNames.some((n) => n === 'テスト')
    ) {
      skippedRows.push({ rowNumber, reason: 'テストの行' });
      continue;
    }

    // 4. 同じファイルの中で、見出しの列の値が前の行とすべて同じ行 -> 外して進む
    const fingerprint = JSON.stringify(headerSlice);
    if (seenRowFingerprints.has(fingerprint)) {
      skippedRows.push({ rowNumber, reason: '同じファイル内の重複行' });
      continue;
    }
    seenRowFingerprints.add(fingerprint);

    targetRowCount += 1;
    let rowHasError = false;
    /**
     * @param {string} reason
     * @param {{ originalName?: string, roleKind?: '上席' | '対象' }} [extra]
     */
    const addRowError = (reason, extra) => {
      rowHasError = true;
      errors.push({
        sourceLabel: fileLabelBase,
        rowNumber,
        reason,
        fileName,
        ...(extra?.originalName ? { originalName: extra.originalName } : {}),
        ...(extra?.roleKind ? { roleKind: extra.roleKind } : {}),
      });
    };

    // 日付の検査
    const rawDate = form === 'A' ? values['日付'] : values['日時'];
    const parsedDate = parseLegacyDate(rawDate);
    if (!parsedDate) {
      addRowError('読めない日付');
    }

    // 上席・対象の名前の検査
    const rawSupervisorCell = form === 'A' ? values['上司'] : values['実行者'];
    const supervisorNames = splitAndCleanNames(rawSupervisorCell);
    if (supervisorNames.length === 0 || targetNames.length === 0) {
      addRowError('上司・実行者・社員・名前が空');
    }
    if (supervisorNames.length >= 2) {
      addRowError('上司・実行者が2人以上');
    }

    /** @type {string[]} */
    const resolvedSupervisors = [];
    for (const supName of supervisorNames) {
      const id = nameToMemberId.get(`上席:${supName}`);
      if (!id) {
        addRowError('対応表にない名前', {
          originalName: supName,
          roleKind: '上席',
        });
      } else if (!resolvedSupervisors.includes(id)) {
        resolvedSupervisors.push(id);
      }
    }

    /** @type {string[]} */
    const resolvedTargets = [];
    for (const tgtName of targetNames) {
      const id = nameToMemberId.get(`対象:${tgtName}`);
      if (!id) {
        addRowError('対応表にない名前', {
          originalName: tgtName,
          roleKind: '対象',
        });
      } else if (!resolvedTargets.includes(id)) {
        resolvedTargets.push(id);
      }
    }

    const legacySource = {
      file: fileName,
      row: rowNumber,
      values,
    };

    if (form === 'A') {
      const itemText = (values['項目'] ?? '').trim();
      let themeId = null;
      if (itemText.length > 0) {
        const foundThemeId = memoThemeMap.get(itemText);
        if (!foundThemeId) {
          addRowError('部下メモのテーマが一覧にない');
        } else {
          themeId = foundThemeId;
        }
      }

      const noticed = (values['気が付いた内容'] ?? '').trim();
      const guidanceRaw = (values['指導内容'] ?? '').trim();
      const futureRaw = (values['今後の指導'] ?? '').trim();

      let guidance = guidanceRaw;
      if (futureRaw.length > 0) {
        guidance =
          guidanceRaw.length > 0
            ? `${guidanceRaw}\n今後の指導：${futureRaw}`
            : `今後の指導：${futureRaw}`;
      }

      // 形A の kind_id は常に null（2026-11-09 本人の選択）
      if (!rowHasError && parsedDate && resolvedSupervisors[0]) {
        memos.push({
          date: parsedDate,
          created_by: resolvedSupervisors[0],
          theme_id: themeId,
          kind_id: null,
          noticed,
          guidance,
          action_check: parseLegacyJudge(values['行動']),
          result_check: parseLegacyJudge(values['結果']),
          submitted_at: `${parsedDate}T00:00:00+09:00`,
          is_legacy: true,
          legacy_source: legacySource,
          target_member_ids: resolvedTargets,
        });
      }
    } else if (form === 'B') {
      const contentKind = (values['内容'] ?? '').trim();
      const detail = (values['詳細'] ?? '').trim();
      const minutes = parseLegacyMinutes(values['時間']);

      if (
        contentKind === 'アポ' ||
        contentKind === '営業' ||
        contentKind === '営業研修'
      ) {
        const kind = contentKind === 'アポ' ? 'apo' : 'sales';
        if (!rowHasError && parsedDate && resolvedSupervisors[0]) {
          for (const memberId of resolvedTargets) {
            roleplays.push({
              date: parsedDate,
              runner_member_id: resolvedSupervisors[0],
              member_id: memberId,
              time_slot: null,
              kind,
              theme_id: null,
              minutes,
              pass_result: null,
              fixed_point: detail,
              next_homework: null,
              note: null,
              submitted_at: `${parsedDate}T00:00:00+09:00`,
              is_legacy: true,
              legacy_source: legacySource,
            });
          }
        }
      } else if (contentKind === '研修') {
        const seminarTheme =
          detail.length > 0 ? `研修：${detail.slice(0, 30)}` : '研修';
        if (!rowHasError && parsedDate && resolvedSupervisors[0]) {
          seminars.push({
            date: parsedDate,
            theme: seminarTheme,
            lecturer: (values['実行者'] ?? '').trim(),
            minutes: minutes ?? 0,
            content: detail,
            created_by: resolvedSupervisors[0],
            is_legacy: true,
            legacy_source: legacySource,
            participant_member_ids: resolvedTargets,
          });
        }
      } else {
        addRowError('内容・方法が振り分けの表にない');
      }
    } else {
      // Form C
      const method = (values['方法'] ?? '').trim();
      const contentKind = (values['内容'] ?? '').trim();
      const detail = (values['詳細'] ?? '').trim();
      const handover = (values['引継ぎ事項'] ?? '').trim();
      const practiceRes = (values['実践結果（FIXも）'] ?? '').trim();
      const minutes = parseLegacyMinutes(values['時間']);

      if (method === 'ロープレ') {
        /** @type {'apo' | 'sales' | null} */
        let kind = null;
        if (contentKind === 'アポ') {
          kind = 'apo';
        } else if (contentKind === '営業' || contentKind === '営業研修') {
          kind = 'sales';
        } else {
          addRowError('内容・方法が振り分けの表にない');
        }

        const nextHomework = handover.length > 0 ? handover : null;

        if (!rowHasError && parsedDate && resolvedSupervisors[0] && kind) {
          for (const memberId of resolvedTargets) {
            roleplays.push({
              date: parsedDate,
              runner_member_id: resolvedSupervisors[0],
              member_id: memberId,
              time_slot: null,
              kind,
              theme_id: null,
              minutes,
              pass_result: null,
              fixed_point: detail,
              next_homework: nextHomework,
              note: null,
              submitted_at: `${parsedDate}T00:00:00+09:00`,
              is_legacy: true,
              legacy_source: legacySource,
            });
          }
        }
      } else if (method === '研修') {
        const contentParts = [detail, handover].filter((s) => s.length > 0);
        if (!rowHasError && parsedDate && resolvedSupervisors[0]) {
          seminars.push({
            date: parsedDate,
            theme: contentKind.length > 0 ? contentKind : '研修',
            lecturer: (values['実行者'] ?? '').trim(),
            minutes: minutes ?? 0,
            content: contentParts.join('\n'),
            created_by: resolvedSupervisors[0],
            is_legacy: true,
            legacy_source: legacySource,
            participant_member_ids: resolvedTargets,
          });
        }
      } else if (method === 'FIX') {
        /** @type {string[]} */
        const guidanceParts = [];
        if (handover.length > 0) {
          guidanceParts.push(`引継ぎ事項：${handover}`);
        }
        if (practiceRes.length > 0) {
          guidanceParts.push(`実践結果：${practiceRes}`);
        }

        if (!rowHasError && parsedDate && resolvedSupervisors[0] && guidanceKindId) {
          memos.push({
            date: parsedDate,
            created_by: resolvedSupervisors[0],
            theme_id: null,
            kind_id: guidanceKindId,
            noticed: detail,
            guidance: guidanceParts.join('\n'),
            action_check: null,
            result_check: null,
            submitted_at: `${parsedDate}T00:00:00+09:00`,
            is_legacy: true,
            legacy_source: legacySource,
            target_member_ids: resolvedTargets,
          });
        }
      } else {
        addRowError('内容・方法が振り分けの表にない');
      }
    }
  }

  return {
    fileIndex,
    fileName,
    form,
    fileLabel,
    targetRowCount,
    skippedRows,
    errors,
    memos,
    roleplays,
    seminars,
  };
}

/**
 * 既存の DB の legacy_source キー集合と照合し、新しく入れる行と既に入っている件数に分ける。
 *
 * @param {{
 *   memos: Array<any>,
 *   roleplays: Array<any>,
 *   seminars: Array<any>,
 *   existingMemoKeys: Set<string>,
 *   existingRoleplayKeys: Set<string>,
 *   existingSeminarKeys: Set<string>,
 * }} params
 */
export function filterAlreadyImportedRecords(params) {
  const {
    memos,
    roleplays,
    seminars,
    existingMemoKeys,
    existingRoleplayKeys,
    existingSeminarKeys,
  } = params;

  const newMemos = [];
  let existingMemoCount = 0;
  for (const m of memos) {
    const key = `${m.legacy_source.file}:${m.legacy_source.row}`;
    if (existingMemoKeys.has(key)) {
      existingMemoCount += 1;
    } else {
      newMemos.push(m);
    }
  }

  const newRoleplays = [];
  let existingRoleplayCount = 0;
  for (const r of roleplays) {
    const key = `${r.legacy_source.file}:${r.legacy_source.row}:${r.member_id}`;
    if (existingRoleplayKeys.has(key)) {
      existingRoleplayCount += 1;
    } else {
      newRoleplays.push(r);
    }
  }

  const newSeminars = [];
  let existingSeminarCount = 0;
  for (const s of seminars) {
    const key = `${s.legacy_source.file}:${s.legacy_source.row}`;
    if (existingSeminarKeys.has(key)) {
      existingSeminarCount += 1;
    } else {
      newSeminars.push(s);
    }
  }

  return {
    newMemos,
    existingMemoCount,
    newRoleplays,
    existingRoleplayCount,
    newSeminars,
    existingSeminarCount,
  };
}

/**
 * --out 指定フォルダに書き出す詳細レポートオブジェクトを組み立てる。
 * 「対応表にない名前」の行ごとに、元の名前（originalName）と上席か対象か（roleKind）を含める。
 *
 * @param {{
 *   mode: 'preview' | 'import',
 *   globalErrors: Array<{ sourceLabel: string, rowNumber: number | null, reason: string }>,
 *   fileResults: Array<{
 *     fileIndex: number,
 *     fileName: string,
 *     form: 'A' | 'B' | 'C' | null,
 *     targetRowCount: number,
 *     skippedRows: Array<{ rowNumber: number, reason: string }>,
 *     errors: Array<{
 *       sourceLabel: string,
 *       rowNumber: number | null,
 *       reason: string,
 *       fileName: string,
 *       originalName?: string,
 *       roleKind?: '上席' | '対象',
 *     }>,
 *   }>,
 *   counts: {
 *     newMemos: number,
 *     existingMemoCount: number,
 *     newRoleplays: number,
 *     existingRoleplayCount: number,
 *     newSeminars: number,
 *     existingSeminarCount: number,
 *   },
 * }} params
 */
export function buildOutReportData(params) {
  const { mode, globalErrors, fileResults, counts } = params;

  /**
   * @type {Array<{
   *   fileIndex: number,
   *   fileName: string,
   *   rowNumber: number | null,
   *   originalName: string,
   *   roleKind: '上席' | '対象',
   * }>}
   */
  const unmappedNames = [];

  for (const f of fileResults) {
    for (const err of f.errors) {
      if (err.reason === '対応表にない名前' && err.originalName && err.roleKind) {
        unmappedNames.push({
          fileIndex: f.fileIndex,
          fileName: f.fileName,
          rowNumber: err.rowNumber,
          originalName: err.originalName,
          roleKind: err.roleKind,
        });
      }
    }
  }

  return {
    mode,
    globalErrors,
    unmappedNames,
    files: fileResults.map((f) => ({
      fileIndex: f.fileIndex,
      fileName: f.fileName,
      form: f.form,
      targetRowCount: f.targetRowCount,
      skippedRows: f.skippedRows,
      errors: f.errors,
    })),
    counts,
  };
}

/**
 * ターミナル表示用のサマリー文字列を組み立てる。
 * 実名・メールアドレス・本文・元ファイル名は一切含めない。
 *
 * @param {{
 *   mode: 'preview' | 'import',
 *   fileSummaries: Array<{
 *     fileLabel: string,
 *     targetRowCount: number,
 *     skippedRows: Array<{ rowNumber: number, reason: string }>,
 *     errors: Array<{ sourceLabel: string, rowNumber: number | null, reason: string }>,
 *   }>,
 *   globalErrors: Array<{ sourceLabel: string, rowNumber: number | null, reason: string }>,
 *   counts: {
 *     newMemos: number,
 *     existingMemoCount: number,
 *     newRoleplays: number,
 *     existingRoleplayCount: number,
 *     newSeminars: number,
 *     existingSeminarCount: number,
 *   },
 * }} params
 * @returns {string}
 */
export function formatSafeTerminalOutput(params) {
  const { mode, fileSummaries, globalErrors, counts } = params;
  const lines = [];

  lines.push(
    mode === 'preview'
      ? '=== 過去の記録 取り込みプレビュー ==='
      : '=== 過去の記録 取り込み ===',
  );

  for (const f of fileSummaries) {
    lines.push(
      `${f.fileLabel}: 対象 ${f.targetRowCount}行 / 外して進む ${f.skippedRows.length}行 / 止める理由 ${f.errors.length}件`,
    );
  }

  const allErrors = [
    ...globalErrors,
    ...fileSummaries.flatMap((f) => f.errors),
  ];

  if (allErrors.length > 0) {
    lines.push('');
    lines.push(`止める理由が ${allErrors.length}件 見つかりました（書き込みは行いません）：`);
    for (const err of allErrors) {
      if (err.rowNumber != null) {
        lines.push(`- ${err.sourceLabel} の ${err.rowNumber}行目：${err.reason}`);
      } else {
        lines.push(`- ${err.sourceLabel}：${err.reason}`);
      }
    }
    return lines.join('\n');
  }

  lines.push('');
  lines.push(
    `subordinate_memos: 新しく入れる ${counts.newMemos}件（すでに入っている ${counts.existingMemoCount}件）`,
  );
  lines.push(
    `roleplays: 新しく入れる ${counts.newRoleplays}件（すでに入っている ${counts.existingRoleplayCount}件）`,
  );
  lines.push(
    `seminars: 新しく入れる ${counts.newSeminars}件（すでに入っている ${counts.existingSeminarCount}件）`,
  );

  return lines.join('\n');
}
