import type { MemberRole } from '../../../foundation/types';
import {
  MEMBERS_CSV_HEADERS,
  type MemberCsvRowValidation,
  type MembersCsvValidationResult,
  type NormalizedMemberImportRow,
  type RawMemberCsvRow,
} from './types';

/**
 * 名簿取り込み用 CSV ひな形の文字列（BOMつき UTF-8 用、見出し1行＋架空の例2行）を生成する。
 */
export function buildMembersTemplateCsvText(): string {
  const lines = [
    MEMBERS_CSV_HEADERS.join(','),
    '架空メンバー1,member1@example.test,メンバー,出る,2026-04-01,架空チームA,架空拠点,2026-04-01',
    '架空メンバー2,member2@example.test,リーダー,出ない,2026-04-01,架空チームA,架空拠点,2026-04-01',
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/**
 * 名簿取り込み用 CSV ひな形のバイト列（先頭3バイトが EF BB BF の BOM つき UTF-8）を生成する。
 */
export function buildMembersTemplateCsvBytes(): Uint8Array {
  return new TextEncoder().encode(buildMembersTemplateCsvText());
}

/**
 * 先頭に UTF-8 BOM (EF BB BF) があれば UTF-8 として読み取り、
 * なければ Shift_JIS として読み取る。
 */
export function decodeMembersCsvBytes(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes.subarray(3));
  }
  const decoder = new TextDecoder('shift_jis');
  return decoder.decode(bytes);
}

/**
 * 1行の CSV 文字列をカンマ区切りで分割する（ダブルクォート対応）。
 */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * YYYY-MM-DD または YYYY/MM/DD を検証し、YYYY-MM-DD に正規化する。
 * 不正な日付（存在しないうるう日など）は null を返す。
 */
export function normalizeDateInput(raw: string): string | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function isValidEmailFormat(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed || trimmed.includes(' ')) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function parseCsvRoleText(
  roleText: string,
): { ok: true; role: Exclude<MemberRole, 'ceo'> } | { ok: false; reason: 'ceo' | 'invalid' } {
  const normalized = roleText.trim();
  if (normalized === '代表' || normalized.toLowerCase() === 'ceo') {
    return { ok: false, reason: 'ceo' };
  }
  if (normalized === 'メンバー') {
    return { ok: true, role: 'member' };
  }
  if (normalized === 'リーダー') {
    return { ok: true, role: 'leader' };
  }
  if (normalized.toUpperCase() === 'MGR') {
    return { ok: true, role: 'mgr' };
  }
  return { ok: false, reason: 'invalid' };
}

export function parseGoesToSalesText(
  text: string,
): { ok: true; value: boolean } | { ok: false } {
  const normalized = text.trim();
  if (normalized === '出る') return { ok: true, value: true };
  if (normalized === '出ない') return { ok: true, value: false };
  return { ok: false };
}

export interface ParsedMembersCsvText {
  headerErrors: string[];
  rows: RawMemberCsvRow[];
}

export function parseMembersCsvText(csvText: string): ParsedMembersCsvText {
  const cleaned = csvText.replace(/^\uFEFF/, '');
  const rawLines = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // 完全に空の末尾行などを除外しつつ行番号を保持
  const nonEmptyLines: Array<{ lineNumber: number; text: string }> = [];
  rawLines.forEach((line, idx) => {
    if (line.trim() !== '') {
      nonEmptyLines.push({ lineNumber: idx + 1, text: line });
    }
  });

  if (nonEmptyLines.length === 0) {
    return {
      headerErrors: ['CSVファイルが空です。'],
      rows: [],
    };
  }

  const headerCells = splitCsvLine(nonEmptyLines[0].text);
  const expectedHeaders = [...MEMBERS_CSV_HEADERS];
  const headerErrors: string[] = [];

  if (
    headerCells.length !== expectedHeaders.length ||
    expectedHeaders.some((expected, idx) => headerCells[idx] !== expected)
  ) {
    headerErrors.push(
      `1行目の見出しが一致しません。正しい見出し：${expectedHeaders.join(',')}`,
    );
    return { headerErrors, rows: [] };
  }

  const rows: RawMemberCsvRow[] = [];
  for (let i = 1; i < nonEmptyLines.length; i += 1) {
    const { lineNumber, text } = nonEmptyLines[i];
    const cells = splitCsvLine(text);
    rows.push({
      rowNumber: lineNumber,
      name: cells[0] ?? '',
      email: cells[1] ?? '',
      roleText: cells[2] ?? '',
      goesToSalesText: cells[3] ?? '',
      hiredOnText: cells[4] ?? '',
      teamName: cells[5] ?? '',
      base: cells[6] ?? '',
      affiliationStartDateText: cells[7] ?? '',
    });
  }

  return { headerErrors, rows };
}

export interface ValidateMembersCsvOptions {
  existingEmails: string[];
  existingTeamNames: string[];
  approvedNewTeamNames?: string[];
}

/**
 * CSV の各行を検証し、行ごとに合わない理由をすべて返す。
 */
export function validateMembersCsv(
  csvText: string,
  options: ValidateMembersCsvOptions,
): MembersCsvValidationResult {
  const parsed = parseMembersCsvText(csvText);
  if (parsed.headerErrors.length > 0) {
    return {
      headerErrors: parsed.headerErrors,
      rows: [],
      unknownTeamNames: [],
      validCount: 0,
      invalidCount: 0,
      canImport: false,
      newTeamsToCreate: [],
      importRows: [],
    };
  }

  const existingEmailSet = new Set(
    options.existingEmails.map((e) => e.trim().toLowerCase()).filter(Boolean),
  );
  const existingTeamSet = new Set(
    options.existingTeamNames.map((t) => t.trim()).filter(Boolean),
  );
  const approvedNewTeamSet = new Set(
    (options.approvedNewTeamNames ?? []).map((t) => t.trim()).filter(Boolean),
  );

  // ファイル内のメール重複を数える（大文字・小文字を区別しない）
  const emailCountInFile = new Map<string, number>();
  for (const row of parsed.rows) {
    const lower = row.email.trim().toLowerCase();
    if (lower) {
      emailCountInFile.set(lower, (emailCountInFile.get(lower) ?? 0) + 1);
    }
  }

  const unknownTeamNamesSet = new Set<string>();
  const newTeamsToCreateSet = new Set<string>();
  const validatedRows: MemberCsvRowValidation[] = [];

  for (const raw of parsed.rows) {
    const errors: string[] = [];
    let missingTeamName: string | null = null;

    // 1. 必須の欄（名前・メール・役割・営業に出る・入社日はいつも必須）
    const name = raw.name.trim();
    const email = raw.email.trim();
    const roleText = raw.roleText.trim();
    const goesToSalesText = raw.goesToSalesText.trim();
    const hiredOnText = raw.hiredOnText.trim();
    const teamName = raw.teamName.trim();
    const base = raw.base.trim();
    const affStartText = raw.affiliationStartDateText.trim();

    if (!name) {
      errors.push('名前が空です');
    }

    if (!email) {
      errors.push('メールが空です');
    } else {
      if (!isValidEmailFormat(email)) {
        errors.push('メールの形が正しくありません');
      }
      const lowerEmail = email.toLowerCase();
      if ((emailCountInFile.get(lowerEmail) ?? 0) > 1) {
        errors.push('同じファイルの中でメールが重なっています');
      }
      if (existingEmailSet.has(lowerEmail)) {
        errors.push('名簿にもう同じメールがいます');
      }
    }

    let parsedRole: Exclude<MemberRole, 'ceo'> | null = null;
    if (!roleText) {
      errors.push('役割が空です');
    } else {
      const roleRes = parseCsvRoleText(roleText);
      if (!roleRes.ok) {
        if (roleRes.reason === 'ceo') {
          errors.push('役割「代表」は一括取り込みでは入れられません');
        } else {
          errors.push('役割は「メンバー」「リーダー」「MGR」のいずれかにしてください');
        }
      } else {
        parsedRole = roleRes.role;
      }
    }

    let parsedGoesToSales: boolean | null = null;
    if (!goesToSalesText) {
      errors.push('営業に出るが空です');
    } else {
      const salesRes = parseGoesToSalesText(goesToSalesText);
      if (!salesRes.ok) {
        errors.push('営業に出るは「出る」「出ない」のいずれかにしてください');
      } else {
        parsedGoesToSales = salesRes.value;
      }
    }

    let normalizedHiredOn: string | null = null;
    if (!hiredOnText) {
      errors.push('入社日が空です');
    } else {
      normalizedHiredOn = normalizeDateInput(hiredOnText);
      if (!normalizedHiredOn) {
        errors.push('入社日の日付が読めません（YYYY-MM-DD または YYYY/MM/DD）');
      }
    }

    // 所属の開始日の日付検証（入っている場合）
    let normalizedAffStart: string | null = null;
    if (affStartText) {
      normalizedAffStart = normalizeDateInput(affStartText);
      if (!normalizedAffStart) {
        errors.push('所属の開始日の日付が読めません（YYYY-MM-DD または YYYY/MM/DD）');
      }
    }

    // 役割に応じたチーム・拠点・所属の開始日の検証
    if (parsedRole === 'member' || parsedRole === 'leader') {
      if (!teamName) {
        errors.push('メンバー・リーダーはチームが必須です');
      }
      if (!base) {
        errors.push('メンバー・リーダーは拠点が必須です');
      }
      if (!affStartText) {
        errors.push('メンバー・リーダーは所属の開始日が必須です');
      }
    } else if (parsedRole === 'mgr') {
      if (teamName || base || affStartText) {
        errors.push(
          'MGRはチーム・拠点・所属の開始日を空にしてください（担当は取り込みのあとに画面で設定します）',
        );
      }
    }

    // 所属の開始日が入社日より前
    if (normalizedHiredOn && normalizedAffStart && normalizedAffStart < normalizedHiredOn) {
      errors.push('所属の開始日が入社日より前になっています');
    }

    // チームが名簿（既存の teams）にない
    if (teamName && parsedRole !== 'mgr') {
      if (!existingTeamSet.has(teamName)) {
        unknownTeamNamesSet.add(teamName);
        missingTeamName = teamName;
        if (approvedNewTeamSet.has(teamName)) {
          newTeamsToCreateSet.add(teamName);
        } else {
          errors.push(
            `チーム「${teamName}」が名簿にありません（「新しいチームとして作る」を選ぶと取り込めます）`,
          );
        }
      }
    }

    const isRowValid =
      errors.length === 0 &&
      parsedRole !== null &&
      parsedGoesToSales !== null &&
      normalizedHiredOn !== null &&
      (parsedRole === 'mgr' || ( Boolean(teamName) && Boolean(base) && normalizedAffStart !== null ));

    const normalized: NormalizedMemberImportRow | null = isRowValid
      ? {
          rowNumber: raw.rowNumber,
          name,
          email,
          role: parsedRole!,
          goesToSales: parsedGoesToSales!,
          hiredOn: normalizedHiredOn!,
          teamName: parsedRole === 'mgr' ? null : teamName,
          base: parsedRole === 'mgr' ? null : base,
          affiliationStartDate: parsedRole === 'mgr' ? null : normalizedAffStart,
        }
      : null;

    validatedRows.push({
      rowNumber: raw.rowNumber,
      raw,
      errors,
      missingTeamName,
      normalized,
    });
  }

  const validCount = validatedRows.filter((r) => r.errors.length === 0 && r.normalized !== null).length;
  const invalidCount = validatedRows.length - validCount;
  const importRows = validatedRows
    .map((r) => r.normalized)
    .filter((r): r is NormalizedMemberImportRow => r !== null);

  return {
    headerErrors: [],
    rows: validatedRows,
    unknownTeamNames: Array.from(unknownTeamNamesSet),
    validCount,
    invalidCount,
    canImport: validatedRows.length > 0 && invalidCount === 0,
    newTeamsToCreate: Array.from(newTeamsToCreateSet),
    importRows,
  };
}
