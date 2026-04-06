#!/usr/bin/env node
// Build .vault-index.json from an Obsidian vault
// Usage: node vault-index.mjs <vault-path>
// Zero dependencies — uses only Node.js built-ins

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, basename, dirname } from 'path';

const vault = process.argv[2];
if (!vault) { console.error('Usage: node vault-index.mjs <vault-path>'); process.exit(1); }
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

function parseFrontmatter(content) {
  if (!content.startsWith('---\n')) return {};
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) return {};
  const yaml = content.slice(4, end);

  const result = {};
  let currentKey = null;
  let currentList = null;

  for (const line of yaml.split('\n')) {
    // Multi-line list item: "  - value"
    if (/^\s+-\s+/.test(line) && currentKey) {
      const val = line.replace(/^\s+-\s+/, '').trim();
      if (!currentList) currentList = [];
      currentList.push(val);
      continue;
    }

    // Save previous list
    if (currentKey && currentList) {
      result[currentKey] = currentList;
      currentList = null;
    }

    // Key-value: "key: value"
    const match = line.match(/^(\w[\w-]*)\s*:\s*(.*)/);
    if (match) {
      currentKey = match[1];
      const rawVal = match[2].trim();

      if (!rawVal) {
        // Value on next lines (multi-line list)
        currentList = null;
        continue;
      }

      // Inline array: [a, b, c]
      if (rawVal.startsWith('[')) {
        result[currentKey] = rawVal
          .replace(/^\[/, '').replace(/\]$/, '')
          .split(',')
          .map(s => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
        currentKey = null;
      } else {
        result[currentKey] = rawVal.replace(/^["']|["']$/g, '');
        currentKey = null;
      }
    }
  }

  // Don't forget trailing list
  if (currentKey && currentList) {
    result[currentKey] = currentList;
  }

  return result;
}

function extractWikilinks(content) {
  const matches = content.match(/\[\[([^\]]+)\]\]/g) || [];
  const links = new Set();
  for (const m of matches) {
    let target = m.slice(2, -2);
    target = target.split('#')[0].split('|')[0].trim();
    if (target) links.add(target);
  }
  return [...links];
}

function extractSummary(content) {
  // Remove frontmatter
  let body = content;
  if (body.startsWith('---\n')) {
    const end = body.indexOf('\n---\n', 4);
    if (end !== -1) body = body.slice(end + 5);
  }

  // Find first non-heading, non-empty line
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    if (trimmed === '---') continue;
    if (trimmed.startsWith('>')) continue;
    if (trimmed.startsWith('- [')) continue;
    return trimmed.slice(0, 120);
  }
  return '';
}

function getParaFolder(relPath) {
  const first = relPath.split('/')[0] || '';
  return first.replace(/^\d+\s*-\s*/, '');
}

// --- Main ---

const files = walk(vault);
const notes = {};
const tagIndex = {};
const folderIndex = {};
const linkGraph = {};

for (const file of files) {
  const rel = relative(vault, file);
  const content = readFileSync(file, 'utf8');
  const fm = parseFrontmatter(content);
  const stat = statSync(file);

  const title = fm.title || fm.id || basename(file, '.md');
  const tags = Array.isArray(fm.tags) ? fm.tags : (fm.tags ? [fm.tags] : []);
  const aliases = Array.isArray(fm.aliases) ? fm.aliases : (fm.aliases ? [fm.aliases] : []);
  const links = extractWikilinks(content);
  const summary = extractSummary(content);
  const updated = stat.mtime.toISOString().split('T')[0];
  const folder = getParaFolder(rel);

  notes[rel] = { title, tags, aliases, links, summary, updated, folder };

  // Tag index
  for (const tag of tags) {
    if (!tagIndex[tag]) tagIndex[tag] = [];
    tagIndex[tag].push(rel);
  }

  // Folder index
  if (!folderIndex[folder]) folderIndex[folder] = [];
  folderIndex[folder].push(rel);

  // Link graph
  if (links.length > 0) linkGraph[rel] = links;
}

const index = {
  generated: new Date().toISOString(),
  noteCount: files.length,
  notes,
  tagIndex,
  folderIndex,
  linkGraph,
};

writeFileSync(join(vault, '.vault-index.json'), JSON.stringify(index, null, 2));
console.log(`Index built: ${join(vault, '.vault-index.json')} (${files.length} notes)`);
