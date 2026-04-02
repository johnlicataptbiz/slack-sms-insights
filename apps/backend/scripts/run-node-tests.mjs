import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const testsRoot = join(root, 'tests');

const shouldInclude = (relativePath) => {
  if (!relativePath.endsWith('.test.ts')) return false;
  if (relativePath === 'example.test.ts') return false;
  if (relativePath.startsWith('controllers/')) return false;
  return true;
};

const collect = (dir) => {
  const entries = readdirSync(dir).sort((a, b) => a.localeCompare(b));
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(dir, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      files.push(...collect(absolutePath));
      continue;
    }

    const relativePath = relative(testsRoot, absolutePath).replace(/\\/g, '/');
    if (shouldInclude(relativePath)) {
      files.push(join('tests', relativePath));
    }
  }

  return files;
};

const files = collect(testsRoot);

if (files.length === 0) {
  console.error('No Node test files found.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(result.signal ? 1 : 0);
