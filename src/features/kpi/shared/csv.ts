import {
  CSV_METRIC_KEYS,
  CSV_METRIC_LABELS,
  CSV_TIME_SLOT_HEADERS,
  KPI_TIME_SLOTS,
  type CtiMemberMapRow,
  type CtiTeamMapRow,
  type ImportLogRow,
  type KpiSlotMetrics,
  type KpiTimeSlot,
} from './types';
import type { MemberAffiliationRow } from '../../../foundation/types';

export interface ParsedCsvPersonRow {
  lineNumber: number;
  ctiName: string;
  slots: Record<KpiTimeSlot, KpiSlotMetrics>;
  dailyTotal: KpiSlotMetrics;
}

export interface ParsedKpiCsv {
  fileName: string;
  csvTeamName: string | null;
  fileDates: string[];
  periodStart: string | null;
  periodEnd: string | null;
  targetDate: string | null;
  headerValid: boolean;
  headerErrors: string[];
  personRows: ParsedCsvPersonRow[];
  totalRow: Record<KpiTimeSlot, KpiSlotMetrics> | null;
  totalRowDaily: KpiSlotMetrics | null;
  summedDaily: KpiSlotMetrics;
  totalsMatch: boolean;
  totalMismatchDetails: string[];
}

export interface MemberMapResolution {
  ctiName: string;
  status: 'mapped' | 'ignored' | 'unmapped' | 'duplicate_overlap';
  memberId: string | null;
  mapIds: string[];
}

export interface TeamMismatchWarning {
  ctiName: string;
  memberId: string;
  memberCurrentTeamId: string | null;
  csvTeamId: string;
}

export interface CsvImportCheckResult {
  parsed: ParsedKpiCsv;
  // 5つのチェック
  check1SingleDay: boolean;
  check1Error: string | null;
  check2HeaderMatch: boolean;
  check2Errors: string[];
  check3AllNamesMapped: boolean;
  unmappedNames: string[];
  overlappingMapNames: string[];
  memberResolutions: MemberMapResolution[];
  check4TotalsMatch: boolean;
  check4MismatchDetails: string[];
  check5ExistingImport: ImportLogRow | null;
  // チーム対応と所属食い違い警告
  resolvedTeamId: string | null;
  overlappingTeamMap: boolean;
  teamMismatchWarnings: TeamMismatchWarning[];
  // 同じ人が同じ日のほかの承認済み取り込みにいるか（承認不可チェック）
  duplicateApprovedMemberIds: string[];
  // 取り込み可能か・承認可能か
  canImport: boolean;
  canApproveAfterImport: boolean;
}

export function decodeShiftJis(bytes: ArrayBuffer | Uint8Array): string {
  const decoder = new TextDecoder('shift_jis');
  return decoder.decode(bytes);
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
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
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function extractCsvTeamName(fileName: string): string | null {
  const base = fileName.replace(/^.*[\\/]/, '');
  const idx = base.indexOf('時間別');
  if (idx <= 0) {
    return null;
  }
  const raw = base.slice(0, idx).trim();
  // 先頭に 20261029_ のような日付プレフィックスが付いている場合は取り除く
  const withoutDatePrefix = raw.replace(/^\d{8}_+/, '').trim();
  return withoutDatePrefix.length > 0 ? withoutDatePrefix : null;
}

export function extractDatesFromFileName(fileName: string): string[] {
  const base = fileName.replace(/^.*[\\/]/, '');
  const matches = base.match(/\d{8}/g) ?? [];
  const formatted: string[] = [];
  for (const m of matches) {
    const y = m.slice(0, 4);
    const mo = m.slice(4, 6);
    const d = m.slice(6, 8);
    const iso = `${y}-${mo}-${d}`;
    if (!formatted.includes(iso)) {
      formatted.push(iso);
    }
  }
  return formatted;
}

function normalizeWaveDash(text: string): string {
  return text.replace(/[\u301c\uff5e~～]/g, '〜');
}

export function extractPeriodDatesFromLine1(line1: string): {
  periodStart: string | null;
  periodEnd: string | null;
} {
  const normalized = normalizeWaveDash(line1);
  // YYYY年MM月DD日 または YYYY/MM/DD または YYYY-MM-DD
  const datePattern = /(\d{4})\s*[年/\-.]\s*(\d{1,2})\s*[月/\-.]\s*(\d{1,2})\s*日?/g;
  const found: string[] = [];
  let match = datePattern.exec(normalized);
  while (match !== null) {
    const y = match[1];
    const mo = match[2].padStart(2, '0');
    const d = match[3].padStart(2, '0');
    found.push(`${y}-${mo}-${d}`);
    match = datePattern.exec(normalized);
  }
  if (found.length === 0) {
    return { periodStart: null, periodEnd: null };
  }
  if (found.length === 1) {
    return { periodStart: found[0], periodEnd: found[0] };
  }
  return { periodStart: found[0], periodEnd: found[1] };
}

function emptyMetrics(): KpiSlotMetrics {
  return { total: 0, connected: 0, recall: 0, owner: 0, prospect: 0, apo: 0 };
}

function addMetrics(a: KpiSlotMetrics, b: KpiSlotMetrics): KpiSlotMetrics {
  return {
    total: a.total + b.total,
    connected: a.connected + b.connected,
    recall: a.recall + b.recall,
    owner: a.owner + b.owner,
    prospect: a.prospect + b.prospect,
    apo: a.apo + b.apo,
  };
}

function parseSlotRow(
  cells: string[],
  lineNumber: number,
  headerErrors: string[],
): { slots: Record<KpiTimeSlot, KpiSlotMetrics>; daily: KpiSlotMetrics } {
  const slots = {} as Record<KpiTimeSlot, KpiSlotMetrics>;
  let daily = emptyMetrics();

  for (let sIdx = 0; sIdx < KPI_TIME_SLOTS.length; sIdx += 1) {
    const slotKey = KPI_TIME_SLOTS[sIdx];
    const baseCol = 1 + sIdx * 6;
    const m: KpiSlotMetrics = emptyMetrics();

    for (let mIdx = 0; mIdx < CSV_METRIC_KEYS.length; mIdx += 1) {
      const metricKey = CSV_METRIC_KEYS[mIdx];
      const rawCell = (cells[baseCol + mIdx] ?? '').trim();
      const normalizedNum = rawCell === '' ? '0' : rawCell;
      if (!/^\d+$/.test(normalizedNum)) {
        headerErrors.push(
          `${lineNumber}行目・${baseCol + mIdx + 1}列目の値「${rawCell}」が0以上の整数ではありません。`,
        );
        m[metricKey] = 0;
      } else {
        m[metricKey] = Number(normalizedNum);
      }
    }

    slots[slotKey] = m;
    daily = addMetrics(daily, m);
  }

  return { slots, daily };
}

export function parseKpiCsvText(text: string, fileName: string): ParsedKpiCsv {
  const cleaned = text.replace(/^\uFEFF/, '');
  const rawLines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  const csvTeamName = extractCsvTeamName(fileName);
  const fileDates = extractDatesFromFileName(fileName);
  const headerErrors: string[] = [];

  if (rawLines.length < 4) {
    return {
      fileName,
      csvTeamName,
      fileDates,
      periodStart: null,
      periodEnd: null,
      targetDate: null,
      headerValid: false,
      headerErrors: ['CSVの行数が足りません（見出し3行＋合計行が必要です）。'],
      personRows: [],
      totalRow: null,
      totalRowDaily: null,
      summedDaily: emptyMetrics(),
      totalsMatch: false,
      totalMismatchDetails: ['CSVの行数が足りないため合計を照合できません。'],
    };
  }

  const line1 = rawLines[0];
  const { periodStart, periodEnd } = extractPeriodDatesFromLine1(line1);
  const targetDate = periodStart && periodEnd && periodStart === periodEnd ? periodStart : periodStart;

  const row2 = parseCsvLine(rawLines[1]);
  const row3 = parseCsvLine(rawLines[2]);

  if (row2.length !== 85) {
    headerErrors.push(`2行目の列数が85列ではありません（${row2.length}列）。`);
  }
  if (row3.length !== 85) {
    headerErrors.push(`3行目の列数が85列ではありません（${row3.length}列）。`);
  }

  // 2行目（時間帯14区分）と3行目（総・実・再・オ・見・ア×14）の検査
  for (let sIdx = 0; sIdx < KPI_TIME_SLOTS.length; sIdx += 1) {
    const slotKey = KPI_TIME_SLOTS[sIdx];
    const expectedSlotHeader = normalizeWaveDash(CSV_TIME_SLOT_HEADERS[slotKey]);
    const baseCol = 1 + sIdx * 6;
    const actualSlotCell = normalizeWaveDash(row2[baseCol] ?? '');

    if (actualSlotCell !== expectedSlotHeader) {
      headerErrors.push(
        `2行目の時間帯見出し（${baseCol + 1}列目）が「${CSV_TIME_SLOT_HEADERS[slotKey]}」ではありません（「${row2[baseCol] ?? ''}」）。`,
      );
    }
    // 同じ時間帯の残り5列は空または同じ時間帯名であることを許容し、別の文字が入っていたら不一致とする
    for (let offset = 1; offset < 6; offset += 1) {
      const subCell = normalizeWaveDash(row2[baseCol + offset] ?? '');
      if (subCell !== '' && subCell !== expectedSlotHeader) {
        headerErrors.push(
          `2行目の時間帯見出し（${baseCol + offset + 1}列目）が想定外です（「${row2[baseCol + offset] ?? ''}」）。`,
        );
      }
    }

    for (let mIdx = 0; mIdx < CSV_METRIC_KEYS.length; mIdx += 1) {
      const metricKey = CSV_METRIC_KEYS[mIdx];
      const expectedMetricLabel = CSV_METRIC_LABELS[metricKey];
      const actualMetricCell = row3[baseCol + mIdx] ?? '';
      if (actualMetricCell !== expectedMetricLabel) {
        headerErrors.push(
          `3行目の項目見出し（${baseCol + mIdx + 1}列目）が「${expectedMetricLabel}」ではありません（「${actualMetricCell}」）。`,
        );
      }
    }
  }

  const lastCells = parseCsvLine(rawLines[rawLines.length - 1]);
  if (lastCells.length !== 85) {
    headerErrors.push(`最終行の列数が85列ではありません（${lastCells.length}列）。`);
  }
  if ((lastCells[0] ?? '') !== '合計') {
    headerErrors.push(`最終行の1列目が「合計」ではありません（「${lastCells[0] ?? ''}」）。`);
  }

  const personRows: ParsedCsvPersonRow[] = [];
  const summedBySlot = {} as Record<KpiTimeSlot, KpiSlotMetrics>;
  for (const slot of KPI_TIME_SLOTS) {
    summedBySlot[slot] = emptyMetrics();
  }
  let summedDaily = emptyMetrics();

  for (let lineIdx = 3; lineIdx < rawLines.length - 1; lineIdx += 1) {
    const lineNum = lineIdx + 1;
    const cells = parseCsvLine(rawLines[lineIdx]);
    if (cells.length !== 85) {
      headerErrors.push(`${lineNum}行目の列数が85列ではありません（${cells.length}列）。`);
    }
    const ctiName = (cells[0] ?? '').trim();
    if (!ctiName) {
      headerErrors.push(`${lineNum}行目の1列目（名前）が空です。`);
    }
    const { slots, daily } = parseSlotRow(cells, lineNum, headerErrors);
    personRows.push({
      lineNumber: lineNum,
      ctiName,
      slots,
      dailyTotal: daily,
    });

    for (const slot of KPI_TIME_SLOTS) {
      summedBySlot[slot] = addMetrics(summedBySlot[slot], slots[slot]);
    }
    summedDaily = addMetrics(summedDaily, daily);
  }

  let totalRow: Record<KpiTimeSlot, KpiSlotMetrics> | null = null;
  let totalRowDaily: KpiSlotMetrics | null = null;
  const totalMismatchDetails: string[] = [];

  if ((lastCells[0] ?? '') === '合計' && lastCells.length === 85) {
    const parsedTotal = parseSlotRow(lastCells, rawLines.length, headerErrors);
    totalRow = parsedTotal.slots;
    totalRowDaily = parsedTotal.daily;

    for (const slot of KPI_TIME_SLOTS) {
      const slotLabel = CSV_TIME_SLOT_HEADERS[slot];
      for (const metricKey of CSV_METRIC_KEYS) {
        const expectedVal = totalRow[slot][metricKey];
        const actualSum = summedBySlot[slot][metricKey];
        if (expectedVal !== actualSum) {
          totalMismatchDetails.push(
            `${slotLabel}の「${CSV_METRIC_LABELS[metricKey]}」の合計が合いません（人の行の合計 ${actualSum} ≠ 合計行 ${expectedVal}）。`,
          );
        }
      }
    }
  } else {
    totalMismatchDetails.push('合計行が見つからないため照合できません。');
  }

  return {
    fileName,
    csvTeamName,
    fileDates,
    periodStart,
    periodEnd,
    targetDate,
    headerValid: headerErrors.length === 0,
    headerErrors,
    personRows,
    totalRow,
    totalRowDaily,
    summedDaily,
    totalsMatch: totalMismatchDetails.length === 0,
    totalMismatchDetails,
  };
}

export function parseKpiCsvBuffer(bytes: ArrayBuffer | Uint8Array, fileName: string): ParsedKpiCsv {
  const text = decodeShiftJis(bytes);
  return parseKpiCsvText(text, fileName);
}

export function isDateInMapPeriod(
  targetDate: string,
  validFrom: string,
  validTo: string | null,
): boolean {
  if (validFrom > targetDate) return false;
  if (validTo !== null && validTo < targetDate) return false;
  return true;
}

export function resolveMemberTeamOnDate(
  memberId: string,
  affiliations: MemberAffiliationRow[],
  targetDate: string,
): string | null {
  const active = affiliations
    .filter(
      (a) =>
        a.member_id === memberId &&
        isDateInMapPeriod(targetDate, a.start_date, a.end_date),
    )
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  return active[0]?.team_id ?? null;
}

export interface ValidateCsvImportOptions {
  parsed: ParsedKpiCsv;
  memberMaps: CtiMemberMapRow[];
  teamMaps: CtiTeamMapRow[];
  affiliations: MemberAffiliationRow[];
  existingLogsOnDate: ImportLogRow[];
  approvedMemberIdsOnDate?: string[];
}

export function validateCsvImport(options: ValidateCsvImportOptions): CsvImportCheckResult {
  const {
    parsed,
    memberMaps,
    teamMaps,
    affiliations,
    existingLogsOnDate,
    approvedMemberIdsOnDate = [],
  } = options;

  // チェック①：期間が1日だけか、ファイル名に日付があれば一致するか、チーム名が取れるか
  let check1SingleDay = true;
  let check1Error: string | null = null;

  if (!parsed.csvTeamName) {
    check1SingleDay = false;
    check1Error = 'ファイル名に「時間別」が含まれていないため、チーム名を読み取れません。';
  } else if (!parsed.periodStart || !parsed.periodEnd) {
    check1SingleDay = false;
    check1Error = '1行目から対象期間の日付を読み取れません。';
  } else if (parsed.periodStart !== parsed.periodEnd) {
    check1SingleDay = false;
    check1Error = `期間が1日だけではありません（${parsed.periodStart}〜${parsed.periodEnd}）。`;
  } else if (
    parsed.fileDates.length > 0 &&
    parsed.fileDates.some((fd) => fd !== parsed.periodStart)
  ) {
    check1SingleDay = false;
    check1Error = `ファイル名の日付（${parsed.fileDates.join('・')}）と1行目の期間（${parsed.periodStart}）が一致しません。`;
  }

  // チェック②：見出しの形が同じか
  const check2HeaderMatch = parsed.headerValid;
  const check2Errors = parsed.headerErrors;

  const targetDate = parsed.targetDate ?? '';

  // チーム名の対応を解決
  let resolvedTeamId: string | null = null;
  let overlappingTeamMap = false;
  if (parsed.csvTeamName && targetDate) {
    const activeTeamMaps = teamMaps.filter(
      (tm) =>
        tm.csv_team_name === parsed.csvTeamName &&
        isDateInMapPeriod(targetDate, tm.valid_from, tm.valid_to),
    );
    if (activeTeamMaps.length === 1) {
      resolvedTeamId = activeTeamMaps[0].team_id;
    } else if (activeTeamMaps.length > 1) {
      overlappingTeamMap = true;
    }
  }

  // チェック③：名前が対応表にあるか（有効期間内）
  const memberResolutions: MemberMapResolution[] = [];
  const unmappedNames: string[] = [];
  const overlappingMapNames: string[] = [];
  const teamMismatchWarnings: TeamMismatchWarning[] = [];

  for (const pRow of parsed.personRows) {
    const matchingMaps = targetDate
      ? memberMaps.filter(
          (mm) =>
            mm.cti_name === pRow.ctiName &&
            isDateInMapPeriod(targetDate, mm.valid_from, mm.valid_to),
        )
      : [];

    if (matchingMaps.length === 0) {
      memberResolutions.push({
        ctiName: pRow.ctiName,
        status: 'unmapped',
        memberId: null,
        mapIds: [],
      });
      if (!unmappedNames.includes(pRow.ctiName)) {
        unmappedNames.push(pRow.ctiName);
      }
    } else if (matchingMaps.length > 1) {
      memberResolutions.push({
        ctiName: pRow.ctiName,
        status: 'duplicate_overlap',
        memberId: null,
        mapIds: matchingMaps.map((m) => m.id),
      });
      if (!overlappingMapNames.includes(pRow.ctiName)) {
        overlappingMapNames.push(pRow.ctiName);
      }
    } else {
      const single = matchingMaps[0];
      if (single.member_id === null) {
        memberResolutions.push({
          ctiName: pRow.ctiName,
          status: 'ignored',
          memberId: null,
          mapIds: [single.id],
        });
      } else {
        memberResolutions.push({
          ctiName: pRow.ctiName,
          status: 'mapped',
          memberId: single.member_id,
          mapIds: [single.id],
        });

        if (resolvedTeamId && targetDate) {
          const memberTeam = resolveMemberTeamOnDate(single.member_id, affiliations, targetDate);
          if (memberTeam !== resolvedTeamId) {
            teamMismatchWarnings.push({
              ctiName: pRow.ctiName,
              memberId: single.member_id,
              memberCurrentTeamId: memberTeam,
              csvTeamId: resolvedTeamId,
            });
          }
        }
      }
    }
  }

  const check3AllNamesMapped = unmappedNames.length === 0 && overlappingMapNames.length === 0;

  // チェック④：項目ごとに人の行（「取り込まない名前」も含むすべて）を足すと合計の行と合うか
  const check4TotalsMatch = parsed.totalsMatch;
  const check4MismatchDetails = parsed.totalMismatchDetails;

  // チェック⑤：同じ日・同じチーム名の取り込みがもうあるか（status !== 'replaced'）
  const check5ExistingImport =
    targetDate && parsed.csvTeamName
      ? (existingLogsOnDate.find(
          (log) =>
            log.target_date === targetDate &&
            log.csv_team_name === parsed.csvTeamName &&
            log.status !== 'replaced',
        ) ?? null)
      : null;

  // 同じ人が同じ日のほかの承認済み取り込みにいるか
  const approvedSet = new Set(approvedMemberIdsOnDate);
  const duplicateApprovedMemberIds: string[] = [];
  for (const res of memberResolutions) {
    if (res.status === 'mapped' && res.memberId && approvedSet.has(res.memberId)) {
      if (!duplicateApprovedMemberIds.includes(res.memberId)) {
        duplicateApprovedMemberIds.push(res.memberId);
      }
    }
  }

  const canImport =
    check1SingleDay &&
    check2HeaderMatch &&
    check3AllNamesMapped &&
    check4TotalsMatch &&
    !overlappingTeamMap;

  const canApproveAfterImport = canImport && duplicateApprovedMemberIds.length === 0;

  return {
    parsed,
    check1SingleDay,
    check1Error,
    check2HeaderMatch,
    check2Errors,
    check3AllNamesMapped,
    unmappedNames,
    overlappingMapNames,
    memberResolutions,
    check4TotalsMatch,
    check4MismatchDetails,
    check5ExistingImport,
    resolvedTeamId,
    overlappingTeamMap,
    teamMismatchWarnings,
    duplicateApprovedMemberIds,
    canImport,
    canApproveAfterImport,
  };
}
