// @ts-check
import fs from 'node:fs';
import { runCli } from './cli.mjs';
import { extractHostFromUrl } from './core.mjs';

const action = process.argv[2] ?? '';
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const host = extractHostFromUrl(supabaseUrl);

if (action === 'load') {
  await runCli([
    'import',
    '--names',
    'fixtures/legacy/names.csv',
    '--dir',
    'fixtures/legacy/clean',
    '--expect-host',
    host,
    '--yes',
  ]);
} else if (action === 'remove') {
  const cleanDir = 'fixtures/legacy/clean';
  const fileArgs = fs
    .readdirSync(cleanDir)
    .filter((f) => f.toLowerCase().endsWith('.csv'))
    .sort((a, b) => a.localeCompare(b, 'ja'))
    .flatMap((f) => ['--file', f]);

  await runCli(['remove', ...fileArgs, '--expect-host', host, '--yes']);
} else {
  console.error('使い方: fixtures-runner.mjs <load|remove>');
  process.exit(1);
}
