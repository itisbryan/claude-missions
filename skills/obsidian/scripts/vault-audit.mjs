#!/usr/bin/env node
// Audit an Obsidian vault for broken links, orphans, empty notes, and stale items
// Usage: node vault-audit.mjs <vault-path>
// Zero dependencies

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, basename } from 'path';

const vault = process.argv[2];
if (!vault) { console.error('Usage: node vault-audit.mjs <vault-path>'); process.exit(1); }
if (!existsSync(join(vault, '.obsidian'))) { console.error(`Error: ${vault} is not an Obsidian vault`); process.exit(1); }

const SKIP = new Set(['.obsidian', '.git', 'node_modules', '.trash']);

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.name.endsWith('.md')) files.push(full);
  }
  return files;
}

const files = walk(vault);
const noteNames = new Map(); // name -> relPath
const linkedTo = new Set();  // names that are linked to
const results = { broken: [], orphans: [], empty: [], stale: [] };

// Index all note names
for (const file of files) {
  const name = basename(file, '.md');
  noteNames.set(name, relative(vault, file));
}

// Scan each file
const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
const cutoff = Date.now() - NINETY_DAYS;

for (const file of files) {
  const rel = relative(vault, file);
  const content = readFileSync(file, 'utf8');

  // Extract wikilinks
  const links = content.match(/\[\[([^\]]+)\]\]/g) || [];
  for (const link of links) {
    let target = link.slice(2, -2).split('#')[0].split('|')[0].trim();
    if (target) {
      linkedTo.add(target);
      if (!noteNames.has(target)) {
        results.broken.push({ source: rel, target });
      }
    }
  }

  // Empty notes (only frontmatter, no real content)
  let body = content;
  if (body.startsWith('---\n')) {
    const end = body.indexOf('\n---\n', 4);
    if (end !== -1) body = body.slice(end + 5);
  }
  const contentLines = body.split('\n').filter(l => l.trim() && !l.startsWith('#')).length;
  if (contentLines === 0) {
    results.empty.push(rel);
  }

  // Stale in-progress
  if (content.includes('in-progress')) {
    const mtime = statSync(file).mtimeMs;
    if (mtime < cutoff) {
      const lastMod = new Date(mtime).toISOString().split('T')[0];
      results.stale.push({ path: rel, lastModified: lastMod });
    }
  }
}

// Orphans — notes nobody links to
for (const [name, rel] of noteNames) {
  if (linkedTo.has(name)) continue;
  // Skip daily notes and index files
  if (rel.includes('Daily') || name.startsWith('_')) continue;
  results.orphans.push(rel);
}

// Output
console.log(`\n## Vault Audit: ${basename(vault)}`);
console.log(`Notes scanned: ${files.length}\n`);

console.log(`### Broken Links (${results.broken.length})\n`);
if (results.broken.length === 0) console.log('- None found');
else for (const b of results.broken) console.log(`- \`${b.source}\` \u2192 [[${b.target}]] (not found)`);

console.log(`\n### Orphan Notes (${results.orphans.length})\n`);
if (results.orphans.length === 0) console.log('- None found');
else for (const o of results.orphans) console.log(`- \`${o}\``);

console.log(`\n### Empty Notes (${results.empty.length})\n`);
if (results.empty.length === 0) console.log('- None found');
else for (const e of results.empty) console.log(`- \`${e}\``);

console.log(`\n### Stale In-Progress (${results.stale.length})\n`);
if (results.stale.length === 0) console.log('- None found');
else for (const s of results.stale) console.log(`- \`${s.path}\` (last modified: ${s.lastModified})`);

console.log(`\n### Summary`);
console.log(`- Broken links: ${results.broken.length}`);
console.log(`- Orphan notes: ${results.orphans.length}`);
console.log(`- Empty notes: ${results.empty.length}`);
console.log(`- Stale in-progress: ${results.stale.length}\n`);
