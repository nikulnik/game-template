#!/usr/bin/env node
// What has drifted between this template and a game built from it.
//
//   node scripts/sync-check.mjs ../game            # report
//   node scripts/sync-check.mjs ../game --diff     # and show the differences
//
// Three verdicts, from sync.json:
//   exact   the two files are meant to be identical — any difference is either a fix to bring
//           back here, or drift to push out to the game.
//   drift   shared in spirit, expected to differ (a game renames things, adds scripts).
//   manual  the same idea in different shapes — compare behaviour by hand.
//
// It also lists files the game has that the template does not, under the directories the template
// considers shared. That list is the answer to "has anything reusable appeared since?".

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const [target, ...flags] = process.argv.slice(2);
const showDiff = flags.includes('--diff');

if (!target) {
  console.error('usage: node scripts/sync-check.mjs <project-dir> [--diff]');
  process.exit(2);
}
if (!existsSync(target)) {
  console.error(`no such project: ${target}`);
  process.exit(2);
}

const { shared } = JSON.parse(readFileSync(join(ROOT, 'sync.json'), 'utf8'));
const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
const counts = { same: 0, differs: 0, missing: 0, manual: 0 };

for (const entry of shared) {
  const mine = read(join(ROOT, entry.template));
  const theirPath = entry.candidates.map((candidate) => join(target, candidate)).find(existsSync);
  if (!theirPath) {
    counts.missing++;
    console.log(`  ?  ${entry.template}  — not in ${target}`);
    continue;
  }
  const theirs = readFileSync(theirPath, 'utf8');
  if (entry.mode === 'manual') {
    counts.manual++;
    console.log(`  ~  ${entry.template}  ↔  ${relative(target, theirPath)}  — by hand: ${entry.note ?? ''}`);
    continue;
  }
  if (mine === theirs) {
    counts.same++;
    continue;
  }
  counts.differs++;
  const mark = entry.mode === 'exact' ? '!!' : '..';
  console.log(`  ${mark} ${entry.template}  ↔  ${relative(target, theirPath)}`);
  if (showDiff && entry.mode === 'exact') {
    try {
      execFileSync('diff', ['-u', join(ROOT, entry.template), theirPath], { stdio: 'inherit' });
    } catch {
      // diff exits 1 when files differ, which is the whole point of running it.
    }
  }
}

// Anything new in the shared directories is a candidate for adoption.
const watched = ['src/platform', 'src/physics', 'src/core', 'src/audio', 'build', 'scripts'];
const known = new Set(shared.flatMap((entry) => entry.candidates));
const newcomers = [];
for (const dir of watched) {
  const full = join(target, dir);
  if (!existsSync(full) || !statSync(full).isDirectory()) continue;
  for (const name of readdirSync(full)) {
    const path = `${dir}/${name}`;
    // Not a newcomer if the template already has the very same file: the manifest may simply not
    // list it yet, and shouting about our own files trains people to ignore the list.
    if (known.has(path) || existsSync(join(ROOT, path)) || statSync(join(target, path)).isDirectory()) continue;
    newcomers.push(path);
  }
}

console.log(`\n${counts.same} in step, ${counts.differs} drifted, ${counts.missing} missing, ${counts.manual} to compare by hand`);
if (newcomers.length > 0) {
  console.log('\nIn the game but not in the template — worth a look:');
  for (const path of newcomers) console.log(`  +  ${path}`);
}
console.log('\n!! is the one to act on: those files are meant to be identical.');
