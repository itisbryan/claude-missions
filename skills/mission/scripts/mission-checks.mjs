#!/usr/bin/env node
// Deterministic mission checks — replaces token-burning LLM pattern scans
// Usage: node mission-checks.mjs <subcommand> [flags]
// Zero dependencies

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, relative, extname, basename } from 'path';
import { execSync, spawnSync } from 'child_process';

// --- CLI parsing ---

const argv = process.argv.slice(2);
const subcommand = argv[0];

function flag(name) {
  const i = argv.indexOf(name);
  if (i === -1) return null;
  return argv[i + 1] ?? true;
}

function hasFlag(name) { return argv.includes(name); }

const jsonMode = hasFlag('--json');
const skipKinds = new Set((flag('--skip') || '').split(',').filter(Boolean));
const filesFlag = flag('--files');
const sinceFlag = flag('--since');

if (!subcommand || subcommand === '--help') {
  console.log(`Usage: node mission-checks.mjs <subcommand> [flags]

Subcommands:
  pre-checks         Run tests + lint + TODO scan over the whole project
  post-implement     Same as pre-checks but scoped to git-changed files
  audit-prefilter    Pattern-detect known issues across changed files

Flags:
  --json             Output JSON (default: human-readable)
  --files <list>     Comma-separated file list; default = git diff --name-only
  --since <ref>      Diff base for --files default; falls back to HEAD~1
  --skip <kinds>     Comma list: tests,lint,todos,patterns
  --print-config     Show discovered test/lint commands and exit`);
  process.exit(0);
}

// --- Config discovery ---

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function discoverCommands() {
  // 1. active-mission.json.checks
  const mission = readJson('.missions/active-mission.json') || readJson('.claude/missions/active-mission.json');
  if (mission?.checks?.test || mission?.checks?.lint) {
    return {
      test: mission.checks.test || null,
      lint: mission.checks.lint || null,
      source: 'active-mission.json',
    };
  }

  // 2. package.json scripts
  const pkg = readJson('package.json');
  if (pkg?.scripts) {
    const test = pkg.scripts.test || null;
    const lint = pkg.scripts.lint || pkg.scripts.eslint || null;
    if (test || lint) {
      return {
        test: test ? 'npm test' : null,
        lint: lint ? `npm run ${pkg.scripts.lint ? 'lint' : 'eslint'}` : null,
        source: 'package.json',
      };
    }
  }

  // 3. Common fallbacks
  const testFallbacks = [
    ['pytest', 'pytest'],
    ['cargo', 'cargo test'],
    ['go', 'go test ./...'],
    ['bundle', 'bundle exec rspec'],
    ['mix', 'mix test'],
  ];
  const lintFallbacks = [
    ['eslint', 'eslint .'],
    ['ruff', 'ruff check'],
    ['cargo', 'cargo clippy'],
    ['go', 'go vet ./...'],
    ['rubocop', 'rubocop'],
  ];

  function which(cmd) {
    try { execSync(`which ${cmd}`, { stdio: 'ignore' }); return true; } catch { return false; }
  }

  let testCmd = null;
  let lintCmd = null;

  for (const [bin, cmd] of testFallbacks) {
    if (which(bin)) { testCmd = cmd; break; }
  }
  for (const [bin, cmd] of lintFallbacks) {
    if (which(bin)) { lintCmd = cmd; break; }
  }

  return { test: testCmd, lint: lintCmd, source: 'fallback' };
}

if (hasFlag('--print-config')) {
  const cfg = discoverCommands();
  if (jsonMode) {
    console.log(JSON.stringify(cfg, null, 2));
  } else {
    console.log(`Test command : ${cfg.test || '(none found)'}`);
    console.log(`Lint command : ${cfg.lint || '(none found)'}`);
    console.log(`Source       : ${cfg.source}`);
  }
  process.exit(0);
}

// --- Git changed files ---

function getChangedFiles(since) {
  if (filesFlag) return filesFlag.split(',').map(f => f.trim()).filter(Boolean);
  try {
    const ref = since || sinceFlag || 'HEAD~1';
    const out = execSync(`git diff --name-only ${ref}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return out.trim().split('\n').filter(Boolean).filter(f => existsSync(f));
  } catch {
    try {
      const out = execSync('git diff --name-only HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      return out.trim().split('\n').filter(Boolean).filter(f => existsSync(f));
    } catch { return []; }
  }
}

// --- Start commit from active-mission.json ---

function getStartCommit() {
  const mission = readJson('.missions/active-mission.json') || readJson('.claude/missions/active-mission.json');
  return mission?.startCommit || null;
}

// --- Run tests ---

function runTests(cmd) {
  if (!cmd || skipKinds.has('tests')) {
    return { ran: false, skipped: true, reason: skipKinds.has('tests') ? 'skipped via --skip' : 'no test command found' };
  }
  const result = spawnSync(cmd, { shell: true, encoding: 'utf8', timeout: 300000 });
  const output = (result.stdout || '') + (result.stderr || '');

  // Parse common test output formats
  let passed = 0; let failed = 0; const failures = [];

  // Jest / Vitest
  const jestMatch = output.match(/Tests?:\s+(?:(\d+) failed,\s*)?(\d+) passed/i);
  if (jestMatch) { failed = parseInt(jestMatch[1] || '0'); passed = parseInt(jestMatch[2]); }

  // pytest
  const pytestMatch = output.match(/(\d+) passed(?:,\s*(\d+) failed)?/);
  if (pytestMatch && !jestMatch) { passed = parseInt(pytestMatch[1]); failed = parseInt(pytestMatch[2] || '0'); }

  // Go test
  const goMatch = output.match(/--- FAIL/g);
  if (goMatch) { failed = goMatch.length; }
  const goPass = output.match(/--- PASS/g);
  if (goPass) { passed = goPass.length; }

  // Extract failure names (jest/vitest style)
  const failLines = output.match(/✕\s+(.+)|✗\s+(.+)|FAIL\s+(.+)/g) || [];
  for (const line of failLines.slice(0, 20)) {
    failures.push({ name: line.trim(), file: '' });
  }

  return {
    ran: true,
    command: cmd,
    passed,
    failed,
    exitCode: result.status ?? (result.error ? 1 : 0),
    failures: failures.slice(0, 10),
  };
}

// --- Run lint ---

function runLint(cmd) {
  if (!cmd || skipKinds.has('lint')) {
    return { ran: false, skipped: true, reason: skipKinds.has('lint') ? 'skipped via --skip' : 'no lint command found' };
  }
  const result = spawnSync(cmd, { shell: true, encoding: 'utf8', timeout: 120000 });
  const output = (result.stdout || '') + (result.stderr || '');

  let errors = 0; let warnings = 0; const issues = [];

  // ESLint JSON format if available; otherwise parse text
  try {
    const jsonStart = output.indexOf('[');
    if (jsonStart !== -1) {
      const parsed = JSON.parse(output.slice(jsonStart));
      for (const file of parsed) {
        for (const msg of file.messages || []) {
          if (msg.severity === 2) errors++;
          else if (msg.severity === 1) warnings++;
          issues.push({ file: file.filePath, line: msg.line, rule: msg.ruleId, msg: msg.message });
        }
      }
    }
  } catch {
    // Text parsing fallback
    const errMatches = output.match(/(\d+) error/i);
    const warnMatches = output.match(/(\d+) warning/i);
    if (errMatches) errors = parseInt(errMatches[1]);
    if (warnMatches) warnings = parseInt(warnMatches[1]);

    // ruff / go vet style: file:line: message
    const lineRe = /^(.+):(\d+):\d*:?\s*(error|warning)?:?\s*(.+)/gm;
    let m;
    while ((m = lineRe.exec(output)) !== null && issues.length < 20) {
      issues.push({ file: m[1], line: parseInt(m[2]), rule: '', msg: m[4] });
    }
  }

  return {
    ran: true,
    command: cmd,
    errors,
    warnings,
    exitCode: result.status ?? (result.error ? 1 : 0),
    issues: issues.slice(0, 20),
  };
}

// --- TODO scan (delegates to obsidian script if available, otherwise inline) ---

function runTodos(files) {
  if (skipKinds.has('todos')) {
    return { ran: false, skipped: true, reason: 'skipped via --skip' };
  }

  const PATTERN = /\b(TODO|FIXME|HACK|XXX)\b/i;
  const items = [];

  const targetFiles = files?.length ? files : walkAllFiles('.');

  for (const file of targetFiles) {
    if (!existsSync(file)) continue;
    let lines;
    try { lines = readFileSync(file, 'utf8').split('\n'); } catch { continue; }
    for (let i = 0; i < lines.length; i++) {
      if (PATTERN.test(lines[i])) {
        const kind = /FIXME/i.test(lines[i]) ? 'FIXME'
          : /HACK/i.test(lines[i]) ? 'HACK'
          : /XXX/i.test(lines[i]) ? 'XXX'
          : 'TODO';
        items.push({ file, line: i + 1, kind, text: lines[i].trim().slice(0, 120) });
      }
    }
  }

  return { ran: true, count: items.length, items };
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', 'dist', 'build', '.next', '__pycache__', '.venv', 'target', '.cache', 'coverage', 'fixtures', '__fixtures__']);
const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rb', '.go', '.rs', '.java', '.swift', '.kt', '.cs', '.php', '.vue', '.svelte', '.sh', '.bash']);

function walkAllFiles(dir) {
  const files = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name) || (entry.name.startsWith('.') && entry.isDirectory())) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...walkAllFiles(full));
      else if (CODE_EXTS.has(extname(entry.name))) files.push(full);
    }
  } catch {}
  return files;
}

// --- Audit prefilter patterns ---

const AUDIT_PATTERNS = [
  {
    rule: 'hardcoded-password',
    regex: /(password|passwd|pwd)\s*[:=]\s*["'][^"']{4,}["']/i,
    severity: 'P0',
    scope: 'code',
  },
  {
    rule: 'hardcoded-api-key',
    regex: /(api[_-]?key|secret|token)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i,
    severity: 'P0',
    scope: 'code',
  },
  {
    rule: 'aws-access-key',
    regex: /AKIA[0-9A-Z]{16}/,
    severity: 'P0',
    scope: 'any',
  },
  {
    rule: 'private-key-block',
    regex: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    severity: 'P0',
    scope: 'any',
  },
  {
    rule: 'debugger-statement',
    regex: /^\s*debugger\s*;?\s*$/,
    severity: 'P1',
    scope: 'js',
  },
  {
    rule: 'eval-call',
    regex: /\beval\s*\(/,
    severity: 'P1',
    scope: 'js',
  },
  {
    rule: 'console-log',
    regex: /\bconsole\.(log|debug)\(/,
    severity: 'P3',
    scope: 'js',
  },
  {
    rule: 'print-debug',
    regex: /\bprint\(.*debug\b/i,
    severity: 'P3',
    scope: 'py',
  },
];

const SKIP_FILE_PATTERNS = [/node_modules/, /dist\//, /\.git\//, /\.min\.\w+$/, /\.(test|spec)\.\w+$/, /__tests__\//, /coverage\//, /\.md$/, /\.lock$/, /fixtures?\//];
const NOSEC_PATTERNS = [/\/\/\s*nosec/, /#\s*nosec/, /eslint-disable-next-line/];

const JS_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte']);
const PY_EXTS = new Set(['.py']);

function scopeMatches(scope, file) {
  if (scope === 'any') return true;
  if (scope === 'js') return JS_EXTS.has(extname(file));
  if (scope === 'py') return PY_EXTS.has(extname(file));
  if (scope === 'code') return CODE_EXTS.has(extname(file));
  return true;
}

function runAuditPrefilter(files) {
  if (skipKinds.has('patterns')) {
    return { skipped: true, reason: 'skipped via --skip', scannedFiles: 0, findings: [], byRule: {}, summary: 'skipped' };
  }

  const findings = [];
  let scanned = 0;

  for (const file of files) {
    if (SKIP_FILE_PATTERNS.some(r => r.test(file))) continue;
    if (!existsSync(file)) continue;
    let lines;
    try { lines = readFileSync(file, 'utf8').split('\n'); } catch { continue; }
    scanned++;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (NOSEC_PATTERNS.some(r => r.test(line))) continue;

      for (const { rule, regex, severity, scope } of AUDIT_PATTERNS) {
        if (!scopeMatches(scope, file)) continue;
        if (regex.test(line)) {
          const match = line.trim().slice(0, 100);
          findings.push({ rule, severity, file, line: i + 1, match });
        }
      }
    }
  }

  const byRule = {};
  for (const f of findings) byRule[f.rule] = (byRule[f.rule] || 0) + 1;

  const p0 = findings.filter(f => f.severity === 'P0').length;
  const p1 = findings.filter(f => f.severity === 'P1').length;
  const summary = findings.length === 0
    ? 'No mechanical findings'
    : `${findings.length} mechanical finding${findings.length > 1 ? 's' : ''} (${p0} P0, ${p1} P1)`;

  return { scannedFiles: scanned, findings, byRule, summary };
}

// --- Verdict helpers ---

function computeVerdict(tests, lint, todos, mode) {
  const testFail = tests.ran && tests.failed > 0;
  const lintFail = lint.ran && lint.errors > 0;
  const todosNonZero = todos.ran && todos.count > 0;

  if (testFail || lintFail) return 'fail';
  if (mode === 'verify' && todosNonZero) return 'fail';
  if (todosNonZero) return 'warn';
  return 'pass';
}

function buildBlockers(tests, lint, todos, mode) {
  const b = [];
  if (tests.ran && tests.failed > 0) b.push(`${tests.failed} test failure${tests.failed > 1 ? 's' : ''}`);
  if (lint.ran && lint.errors > 0) b.push(`${lint.errors} lint error${lint.errors > 1 ? 's' : ''}`);
  if (mode === 'verify' && todos.ran && todos.count > 0) b.push(`${todos.count} unresolved TODO/FIXME items`);
  return b;
}

// --- Pre-checks / Post-implement ---

function runChecks(files, mode) {
  const cfg = discoverCommands();
  const tests = runTests(cfg.test);
  const lint = runLint(cfg.lint);
  const todos = runTodos(files || null);
  const verdict = computeVerdict(tests, lint, todos, mode);
  const blockers = buildBlockers(tests, lint, todos, mode);

  const result = { tests, lint, todos, verdict, blockers };

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const icon = { pass: '✅', warn: '⚠️', fail: '❌' }[verdict] || '?';
    console.error(`${icon} ${verdict.toUpperCase()}${blockers.length ? ': ' + blockers.join(', ') : ''}`);

    if (tests.ran) {
      console.log(`Tests  : ${tests.passed} passed, ${tests.failed} failed (exit ${tests.exitCode})`);
    } else {
      console.log(`Tests  : skipped — ${tests.reason}`);
    }
    if (lint.ran) {
      console.log(`Lint   : ${lint.errors} errors, ${lint.warnings} warnings (exit ${lint.exitCode})`);
    } else {
      console.log(`Lint   : skipped — ${lint.reason}`);
    }
    if (todos.ran) {
      console.log(`TODOs  : ${todos.count} items`);
    } else {
      console.log(`TODOs  : skipped`);
    }
  }

  process.exit(verdict === 'fail' ? 1 : verdict === 'warn' ? 2 : 0);
}

// --- Dispatch ---

switch (subcommand) {
  case 'pre-checks': {
    runChecks(null, 'pre');
    break;
  }
  case 'post-implement': {
    const startCommit = getStartCommit();
    const files = getChangedFiles(startCommit);
    runChecks(files.length ? files : null, 'post');
    break;
  }
  case 'audit-prefilter': {
    const startCommit = getStartCommit();
    const files = getChangedFiles(startCommit);
    const result = runAuditPrefilter(files.length ? files : walkAllFiles('.'));

    if (jsonMode) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Scanned: ${result.scannedFiles} files`);
      console.log(`Summary: ${result.summary}`);
      if (result.findings.length > 0) {
        console.log('\nFindings:');
        for (const f of result.findings) {
          console.log(`  [${f.severity}] ${f.rule} — ${f.file}:${f.line}: ${f.match}`);
        }
      }
    }
    process.exit(result.findings.filter(f => f.severity === 'P0').length > 0 ? 1 : 0);
    break;
  }
  default: {
    console.error(`Unknown subcommand: ${subcommand}`);
    console.error('Use --help for usage.');
    process.exit(1);
  }
}
