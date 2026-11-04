import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

function normalizeDbUrl(raw) {
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, '');
  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    const match = trimmed.match(/^(postgresql?:\/\/[^:/@]+):(.+)@([^@]+)$/);
    if (match) {
      return `${match[1]}:${encodeURIComponent(match[2])}@${match[3]}`;
    }
    return trimmed;
  }
}

const dbUrl = normalizeDbUrl(process.env.SUPABASE_DB_URL ?? '');
if (!dbUrl) {
  console.error('SUPABASE_DB_URL が設定されていません。');
  process.exit(1);
}

const rawArgs = process.argv.slice(2);
if (rawArgs.includes('--debug')) {
  console.error('--debug は指定できません。');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const PLATFORMS = {
  darwin: { arm64: ['darwin-arm64'], x64: ['darwin-x64'] },
  linux: {
    arm64: ['linux-arm64', 'linux-arm64-musl'],
    x64: ['linux-x64', 'linux-x64-musl'],
  },
  win32: { arm64: ['windows-arm64'], x64: ['windows-x64'] },
};

const ext = process.platform === 'win32' ? '.exe' : '';
const candidates = PLATFORMS[process.platform]?.[os.arch()] ?? [];
let binPath = '';

for (const suffix of candidates) {
  try {
    const pkgJsonPath = require.resolve(`@supabase/cli-${suffix}/package.json`);
    const candidatePath = path.join(path.dirname(pkgJsonPath), 'bin', `supabase${ext}`);
    if (fs.existsSync(candidatePath)) {
      binPath = candidatePath;
      break;
    }
  } catch {
    // ignore and try next candidate
  }
}

if (!binPath) {
  const fallback = path.resolve(
    process.cwd(),
    'node_modules',
    'supabase',
    'bin',
    `supabase${ext}`,
  );
  if (fs.existsSync(fallback)) {
    binPath = fallback;
  }
}

if (!binPath || !fs.existsSync(binPath)) {
  console.error('devDependency の supabase 実行ファイルが見つかりません。');
  process.exit(1);
}

const result = spawnSync(binPath, ['db', 'push', '--db-url', dbUrl, ...rawArgs], {
  shell: false,
  stdio: 'inherit',
});

if (result.error) {
  console.error('supabase db push の起動に失敗しました:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
