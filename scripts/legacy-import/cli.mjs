// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  buildMastersLookup,
  filterAlreadyImportedRecords,
  formatSafeTerminalOutput,
  parseNamesMapping,
  processLegacyCsvFile,
} from './core.mjs';

/**
 * コマンドライン引数を解析する。
 * @param {string[]} argv
 */
function parseCliArgs(argv) {
  const mode = argv[0] ?? '';
  let namesPath = '';
  let dirPath = '';
  let outDir = '';
  /** @type {string[]} */
  const files = [];

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--names' && argv[i + 1]) {
      namesPath = argv[i + 1];
      i += 1;
    } else if (arg === '--dir' && argv[i + 1]) {
      dirPath = argv[i + 1];
      i += 1;
    } else if (arg === '--out' && argv[i + 1]) {
      outDir = argv[i + 1];
      i += 1;
    } else if (arg === '--file' && argv[i + 1]) {
      files.push(argv[i + 1]);
      i += 1;
    }
  }

  return { mode, namesPath, dirPath, outDir, files };
}

/**
 * Supabase のエラーから個人情報を含む details / hint 等を除き、code と message だけを返す。
 * @param {string} step
 * @param {{ code?: string, message?: string } | null} error
 */
function formatDbError(step, error) {
  const code = error?.code ?? 'unknown';
  const message = error?.message ?? 'unknown';
  return `${step} に失敗しました (code=${code}, message=${message})`;
}

function createServiceClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      '.env に VITE_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください。',
    );
    process.exit(1);
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * @param {ReturnType<typeof createServiceClient>} admin
 */
async function fetchExistingLegacyKeys(admin) {
  const [memosRes, roleplaysRes, seminarsRes] = await Promise.all([
    admin.from('subordinate_memos').select('id, legacy_source').eq('is_legacy', true),
    admin.from('roleplays').select('id, member_id, legacy_source').eq('is_legacy', true),
    admin.from('seminars').select('id, legacy_source').eq('is_legacy', true),
  ]);

  if (memosRes.error) {
    throw new Error(formatDbError('subordinate_memos 読み込み', memosRes.error));
  }
  if (roleplaysRes.error) {
    throw new Error(formatDbError('roleplays 読み込み', roleplaysRes.error));
  }
  if (seminarsRes.error) {
    throw new Error(formatDbError('seminars 読み込み', seminarsRes.error));
  }

  /** @type {Set<string>} */
  const existingMemoKeys = new Set();
  for (const row of memosRes.data ?? []) {
    const src = /** @type {any} */ (row.legacy_source);
    if (src && src.file != null && src.row != null) {
      existingMemoKeys.add(`${src.file}:${src.row}`);
    }
  }

  /** @type {Set<string>} */
  const existingRoleplayKeys = new Set();
  for (const row of roleplaysRes.data ?? []) {
    const src = /** @type {any} */ (row.legacy_source);
    if (src && src.file != null && src.row != null && row.member_id) {
      existingRoleplayKeys.add(`${src.file}:${src.row}:${row.member_id}`);
    }
  }

  /** @type {Set<string>} */
  const existingSeminarKeys = new Set();
  for (const row of seminarsRes.data ?? []) {
    const src = /** @type {any} */ (row.legacy_source);
    if (src && src.file != null && src.row != null) {
      existingSeminarKeys.add(`${src.file}:${src.row}`);
    }
  }

  return {
    existingMemoKeys,
    existingRoleplayKeys,
    existingSeminarKeys,
  };
}

/**
 * @param {'preview' | 'import'} mode
 * @param {{ namesPath: string, dirPath: string, outDir: string }} opts
 */
async function runPreviewOrImport(mode, opts) {
  if (!opts.namesPath || !opts.dirPath) {
    console.error(
      `使い方: npm run legacy:${mode} -- --names <names.csv> --dir <フォルダ> [--out <書き出し先フォルダ>]`,
    );
    process.exit(1);
  }

  if (!fs.existsSync(opts.namesPath)) {
    console.error('指定された対応表ファイルが見つかりません。');
    process.exit(1);
  }
  if (!fs.existsSync(opts.dirPath)) {
    console.error('指定された CSV フォルダが見つかりません。');
    process.exit(1);
  }

  const csvFileNames = fs
    .readdirSync(opts.dirPath)
    .filter((f) => f.toLowerCase().endsWith('.csv'))
    .sort((a, b) => a.localeCompare(b, 'ja'));

  if (csvFileNames.length === 0) {
    console.error('指定されたフォルダに CSV ファイルがありません。');
    process.exit(1);
  }

  const admin = createServiceClient();

  const [membersRes, mastersRes, existingKeys] = await Promise.all([
    admin.from('members').select('id, email'),
    admin.from('masters').select('id, kind, name, is_active'),
    fetchExistingLegacyKeys(admin),
  ]);

  if (membersRes.error) {
    throw new Error(formatDbError('members 読み込み', membersRes.error));
  }
  if (mastersRes.error) {
    throw new Error(formatDbError('masters 読み込み', mastersRes.error));
  }

  const namesBytes = fs.readFileSync(opts.namesPath);
  const namesMapping = parseNamesMapping(namesBytes, membersRes.data ?? []);
  const mastersLookup = buildMastersLookup(mastersRes.data ?? []);

  const globalErrors = [...namesMapping.errors, ...mastersLookup.errors];

  const fileResults = csvFileNames.map((fileName, idx) => {
    const fullPath = path.join(opts.dirPath, fileName);
    const bytes = fs.readFileSync(fullPath);
    return processLegacyCsvFile({
      fileIndex: idx + 1,
      fileName,
      bytes,
      nameToMemberId: namesMapping.nameToMemberId,
      memoThemeMap: mastersLookup.memoThemeMap,
      guidanceKindId: mastersLookup.guidanceKindId,
    });
  });

  const allMemos = fileResults.flatMap((f) => f.memos);
  const allRoleplays = fileResults.flatMap((f) => f.roleplays);
  const allSeminars = fileResults.flatMap((f) => f.seminars);

  const deduped = filterAlreadyImportedRecords({
    memos: allMemos,
    roleplays: allRoleplays,
    seminars: allSeminars,
    existingMemoKeys: existingKeys.existingMemoKeys,
    existingRoleplayKeys: existingKeys.existingRoleplayKeys,
    existingSeminarKeys: existingKeys.existingSeminarKeys,
  });

  if (opts.outDir) {
    fs.mkdirSync(opts.outDir, { recursive: true });
    const reportPath = path.join(opts.outDir, 'legacy-report.json');
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          mode,
          globalErrors,
          files: fileResults.map((f) => ({
            fileIndex: f.fileIndex,
            fileName: f.fileName,
            form: f.form,
            targetRowCount: f.targetRowCount,
            skippedRows: f.skippedRows,
            errors: f.errors,
          })),
          counts: {
            newMemos: deduped.newMemos.length,
            existingMemoCount: deduped.existingMemoCount,
            newRoleplays: deduped.newRoleplays.length,
            existingRoleplayCount: deduped.existingRoleplayCount,
            newSeminars: deduped.newSeminars.length,
            existingSeminarCount: deduped.existingSeminarCount,
          },
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  const totalErrorCount =
    globalErrors.length + fileResults.reduce((acc, f) => acc + f.errors.length, 0);

  const safeText = formatSafeTerminalOutput({
    mode,
    fileSummaries: fileResults,
    globalErrors,
    counts: {
      newMemos: deduped.newMemos.length,
      existingMemoCount: deduped.existingMemoCount,
      newRoleplays: deduped.newRoleplays.length,
      existingRoleplayCount: deduped.existingRoleplayCount,
      newSeminars: deduped.newSeminars.length,
      existingSeminarCount: deduped.existingSeminarCount,
    },
  });

  if (totalErrorCount > 0) {
    console.error(safeText);
    process.exit(1);
  }

  console.log(safeText);

  if (mode === 'preview') {
    return;
  }

  // import 実行：エラーが0件であることを確認した上で順番に書き込む
  for (const memo of deduped.newMemos) {
    const { target_member_ids, ...memoRow } = memo;
    const { data: insertedMemo, error: memoErr } = await admin
      .from('subordinate_memos')
      .insert(memoRow)
      .select('id')
      .single();

    if (memoErr || !insertedMemo) {
      throw new Error(formatDbError('subordinate_memos 書き込み', memoErr));
    }

    if (target_member_ids.length > 0) {
      const targetRows = target_member_ids.map((memberId) => ({
        memo_id: insertedMemo.id,
        member_id: memberId,
      }));
      const { error: tgtErr } = await admin
        .from('subordinate_memo_targets')
        .insert(targetRows);
      if (tgtErr) {
        throw new Error(formatDbError('subordinate_memo_targets 書き込み', tgtErr));
      }
    }
  }

  if (deduped.newRoleplays.length > 0) {
    const { error: rpErr } = await admin
      .from('roleplays')
      .insert(deduped.newRoleplays);
    if (rpErr) {
      throw new Error(formatDbError('roleplays 書き込み', rpErr));
    }
  }

  for (const sem of deduped.newSeminars) {
    const { participant_member_ids, ...seminarRow } = sem;
    const { data: insertedSem, error: semErr } = await admin
      .from('seminars')
      .insert(seminarRow)
      .select('id')
      .single();

    if (semErr || !insertedSem) {
      throw new Error(formatDbError('seminars 書き込み', semErr));
    }

    if (participant_member_ids.length > 0) {
      const memberRows = participant_member_ids.map((memberId) => ({
        seminar_id: insertedSem.id,
        member_id: memberId,
      }));
      const { error: smErr } = await admin
        .from('seminar_members')
        .insert(memberRows);
      if (smErr) {
        throw new Error(formatDbError('seminar_members 書き込み', smErr));
      }
    }
  }

  console.log('取り込みが完了しました。');
}

/**
 * @param {{ dirPath: string, files: string[] }} opts
 */
async function runRemove(opts) {
  /** @type {Set<string>} */
  const targetFiles = new Set();

  if (opts.dirPath) {
    if (!fs.existsSync(opts.dirPath)) {
      console.error('指定された CSV フォルダが見つかりません。');
      process.exit(1);
    }
    for (const f of fs.readdirSync(opts.dirPath)) {
      if (f.toLowerCase().endsWith('.csv')) {
        targetFiles.add(path.basename(f));
      }
    }
  }

  for (const f of opts.files) {
    targetFiles.add(path.basename(f));
  }

  if (targetFiles.size === 0) {
    console.error(
      '使い方: npm run legacy:remove -- --dir <フォルダ> または --file <ファイル名>',
    );
    process.exit(1);
  }

  const admin = createServiceClient();

  const [memosRes, roleplaysRes, seminarsRes] = await Promise.all([
    admin.from('subordinate_memos').select('id, legacy_source').eq('is_legacy', true),
    admin.from('roleplays').select('id, legacy_source').eq('is_legacy', true),
    admin.from('seminars').select('id, legacy_source').eq('is_legacy', true),
  ]);

  if (memosRes.error) {
    throw new Error(formatDbError('subordinate_memos 読み込み', memosRes.error));
  }
  if (roleplaysRes.error) {
    throw new Error(formatDbError('roleplays 読み込み', roleplaysRes.error));
  }
  if (seminarsRes.error) {
    throw new Error(formatDbError('seminars 読み込み', seminarsRes.error));
  }

  const memoIds = (memosRes.data ?? [])
    .filter((r) => {
      const src = /** @type {any} */ (r.legacy_source);
      return src && typeof src.file === 'string' && targetFiles.has(src.file);
    })
    .map((r) => r.id);

  const roleplayIds = (roleplaysRes.data ?? [])
    .filter((r) => {
      const src = /** @type {any} */ (r.legacy_source);
      return src && typeof src.file === 'string' && targetFiles.has(src.file);
    })
    .map((r) => r.id);

  const seminarIds = (seminarsRes.data ?? [])
    .filter((r) => {
      const src = /** @type {any} */ (r.legacy_source);
      return src && typeof src.file === 'string' && targetFiles.has(src.file);
    })
    .map((r) => r.id);

  if (memoIds.length > 0) {
    const { error: tgtErr } = await admin
      .from('subordinate_memo_targets')
      .delete()
      .in('memo_id', memoIds);
    if (tgtErr) {
      throw new Error(formatDbError('subordinate_memo_targets 削除', tgtErr));
    }

    const { error: memoErr } = await admin
      .from('subordinate_memos')
      .delete()
      .in('id', memoIds);
    if (memoErr) {
      throw new Error(formatDbError('subordinate_memos 削除', memoErr));
    }
  }

  if (roleplayIds.length > 0) {
    const { error: rpErr } = await admin
      .from('roleplays')
      .delete()
      .in('id', roleplayIds);
    if (rpErr) {
      throw new Error(formatDbError('roleplays 削除', rpErr));
    }
  }

  if (seminarIds.length > 0) {
    const { error: smErr } = await admin
      .from('seminar_members')
      .delete()
      .in('seminar_id', seminarIds);
    if (smErr) {
      throw new Error(formatDbError('seminar_members 削除', smErr));
    }

    const { error: semErr } = await admin
      .from('seminars')
      .delete()
      .in('id', seminarIds);
    if (semErr) {
      throw new Error(formatDbError('seminars 削除', semErr));
    }
  }

  console.log('=== 過去の記録 取り消し ===');
  console.log(`subordinate_memos: 削除 ${memoIds.length}件`);
  console.log(`roleplays: 削除 ${roleplayIds.length}件`);
  console.log(`seminars: 削除 ${seminarIds.length}件`);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  try {
    if (args.mode === 'preview' || args.mode === 'import') {
      await runPreviewOrImport(args.mode, {
        namesPath: args.namesPath,
        dirPath: args.dirPath,
        outDir: args.outDir,
      });
    } else if (args.mode === 'remove') {
      await runRemove({
        dirPath: args.dirPath,
        files: args.files,
      });
    } else {
      console.error('使い方: cli.mjs <preview|import|remove> [options]');
      process.exit(1);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '不明なエラー';
    console.error(msg);
    process.exit(1);
  }
}

main();
