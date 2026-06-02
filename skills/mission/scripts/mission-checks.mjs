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
  audit-prefilter    Pattern-detect known issues + emit scope-based reviewer gating
  audit-synthesis    Merge/dedup reviewer JSON findings (--findings a.json,b.json)

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

// Run git with an argv array (NO shell) so a malicious ref can't inject commands.
function gitLines(args) {
  const r = spawnSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  if (r.status !== 0 || !r.stdout) return null;
  return r.stdout.trim().split('\n').filter(Boolean);
}

function getChangedFiles(since) {
  if (filesFlag) return filesFlag.split(',').map(f => f.trim()).filter(Boolean);
  const ref = since || sinceFlag || 'HEAD~1';
  const lines = gitLines(['diff', '--name-only', ref]) || gitLines(['diff', '--name-only', 'HEAD']) || [];
  return lines.filter(f => existsSync(f));
}

// --- Diff size (for scope-based reviewer gating) ---

function getDiffStat(since) {
  if (filesFlag) {
    // Explicit file list: count is known, line delta is not — treat as unknown.
    return { filesChanged: filesFlag.split(',').map(f => f.trim()).filter(Boolean).length, linesChanged: null };
  }
  const ref = since || sinceFlag || 'HEAD~1';
  const rows = gitLines(['diff', '--numstat', ref]);
  if (!rows) return { filesChanged: 0, linesChanged: null };
  let files = 0, lines = 0;
  for (const row of rows) {
    const [add, del] = row.split('\t');
    files++;
    lines += (parseInt(add, 10) || 0) + (parseInt(del, 10) || 0);
  }
  return { filesChanged: files, linesChanged: lines };
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

// --- TODO scan (inline pattern match) ---

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

// Conservative scope markers — used to gate which Audit reviewers to dispatch.
// Bias toward over-detection: a false positive only means "ran a reviewer we
// didn't strictly need", never "skipped a reviewer that mattered".
const SCOPE_MARKERS = {
  hasAsync:         /async\s+function|\basync\b|\bawait\b|\bPromise\b|\.(then|catch|finally)\s*\(|\bgoroutine\b|\bThread\b|\bmutex\b|\bsemaphore\b|setTimeout|setInterval|\bqueue\b|\bworker\b|concurrent/i,
  hasDb:            /\b(SELECT|INSERT|UPDATE|DELETE)\b|\.(query|exec|execute)\s*\(|prisma|sequelize|\bknex\b|mongoose|\.(findOne|findMany|save|create|destroy)\b|ActiveRecord|repository/i,
  hasNetwork:       /\bfetch\s*\(|axios|https?:\/\/|requests\.|urllib|XMLHttpRequest|WebSocket|\bgrpc\b/i,
  hasLoops:         /\bfor\b|\bwhile\b|\.(map|forEach|reduce|filter|flatMap)\s*\(/,
  hasMemory:        /\bcache\b|new\s+(Array|Map|Set|WeakMap)|Buffer\.|allocate|malloc|\bstream\b/i,
  hasIO:            /\bfs\.|readFile|writeFile|\bopen\s*\(|child_process|\bexec(Sync)?\s*\(|\bspawn\s*\(|os\.(path|system)/i,
  hasAuth:          /\bauthn\b|\bauthz\b|authenticat|authoriz|\blogin\b|\blogout\b|\bsession\b|\btoken\b|\bjwt\b|oauth|\bpassword\b|credential|permission|\brole\b|\brbac\b|\bacl\b/i,
  hasCrypto:        /\bcrypto\b|hashlib|bcrypt|scrypt|argon2|\bhmac\b|sha\d{3}|\bmd5\b|cipher|encrypt|decrypt|\bsecrets\b|randomBytes/i,
  hasInput:         /req\.(body|query|params)|request\.(form|json|args|data)|process\.argv|\binput\s*\(|\bpayload\b|deserialize|JSON\.parse|unmarshal/i,
  hasHttpEndpoints: /@app\.route|@router\.|(app|router)\.(get|post|put|delete|patch)\s*\(|@(Get|Post|Put|Delete|Patch)Mapping|\bdef\s+(get|post|put|delete|patch)\b/i,
};
const SECRET_RULES = new Set(['hardcoded-password', 'hardcoded-api-key', 'aws-access-key', 'private-key-block']);
const PERF_SIZE_FILES = 5;
const PERF_SIZE_LINES = 200;

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

function runAuditPrefilter(files, sizeInfo) {
  if (skipKinds.has('patterns')) {
    return { skipped: true, reason: 'skipped via --skip', scannedFiles: 0, findings: [], byRule: {}, summary: 'skipped' };
  }

  const findings = [];
  let scanned = 0;
  const scope = Object.fromEntries(Object.keys(SCOPE_MARKERS).map(k => [k, false]));

  for (const file of files) {
    if (SKIP_FILE_PATTERNS.some(r => r.test(file))) continue;
    if (!existsSync(file)) continue;
    let lines;
    try { lines = readFileSync(file, 'utf8').split('\n'); } catch { continue; }
    scanned++;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Scope detection (always runs, even on nosec lines)
      for (const [key, re] of Object.entries(SCOPE_MARKERS)) {
        if (!scope[key] && re.test(line)) scope[key] = true;
      }

      if (NOSEC_PATTERNS.some(r => r.test(line))) continue;

      for (const { rule, regex, severity, scope: patScope } of AUDIT_PATTERNS) {
        if (!scopeMatches(patScope, file)) continue;
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

  scope.hasSecrets = findings.some(f => SECRET_RULES.has(f.rule));
  const { filesChanged = 0, linesChanged = null } = sizeInfo || {};
  // Unknown size (null) is treated as "large" so we never under-dispatch.
  const big = linesChanged == null || linesChanged >= PERF_SIZE_LINES || filesChanged >= PERF_SIZE_FILES;
  // If nothing was scanned, detection is inconclusive → dispatch everything.
  const inconclusive = scanned === 0;

  const gating = {
    // Async/Concurrency reviewer (Reviewer 4) — SAFE-tier gate (auto).
    async_concurrency: inconclusive || scope.hasAsync,
    // Performance/Architecture reviewer (Reviewer 5) — SAFE-tier gate (auto).
    performance_arch: inconclusive || (big && (scope.hasDb || scope.hasNetwork || scope.hasLoops || scope.hasMemory)),
    // Security reviewer (Reviewer 2) — only consulted when the AGGRESSIVE opt-in
    // flag is enabled; default behavior always dispatches Security.
    security: inconclusive || scope.hasAuth || scope.hasCrypto || scope.hasInput || scope.hasIO || scope.hasHttpEndpoints || scope.hasSecrets || p0 > 0,
  };
  // Reviewers 1 (Business) and 3 (Edge Cases) are never gated.
  const dispatch = {
    business_logic: true,
    security: true, // default; aggressive opt-in overrides with gating.security
    edge_cases: true,
    async_concurrency: gating.async_concurrency,
    performance_arch: gating.performance_arch,
  };
  const skipped = Object.entries(dispatch).filter(([, v]) => !v).map(([k]) => k);

  return {
    scannedFiles: scanned,
    size: { filesChanged, linesChanged },
    findings,
    byRule,
    summary,
    scope,
    gating,
    dispatch,
    gatingNote: skipped.length
      ? `Scope gating: skip ${skipped.join(', ')} (no matching markers). Security gating (aggressive opt-in only): ${gating.security ? 'dispatch' : 'skippable'}.`
      : 'Scope gating: all auto-gated reviewers in scope — dispatch full panel.',
  };
}

// --- Audit synthesis (deterministic merge of reviewer JSON findings) ---

function severityRank(s) { return ({ P0: 0, P1: 1, P2: 2, P3: 3 })[s] ?? 4; }

function runAuditSynthesis(fileList) {
  const all = [];
  for (const fp of fileList) {
    let parsed;
    try { parsed = JSON.parse(readFileSync(fp, 'utf8')); } catch { continue; }
    if (Array.isArray(parsed)) all.push(...parsed);
    else if (parsed && Array.isArray(parsed.findings)) all.push(...parsed.findings);
  }
  const merged = new Map();
  for (const f of all) {
    if (!f || typeof f !== 'object') continue;
    const file = f.file || '?';
    const line = f.line ?? '';
    const sev = f.severity || 'P3';
    const tag = String(f.rule || f.title || f.issue || '').slice(0, 40).toLowerCase();
    const key = `${file}:${line}:${tag}`;
    const ex = merged.get(key);
    if (!ex) {
      merged.set(key, { ...f, severity: sev, reviewers: f.reviewer ? [f.reviewer] : [] });
    } else {
      if (severityRank(sev) < severityRank(ex.severity)) ex.severity = sev; // keep highest
      if (f.reviewer && !ex.reviewers.includes(f.reviewer)) ex.reviewers.push(f.reviewer);
    }
  }
  const findings = [...merged.values()].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity) || String(a.file).localeCompare(String(b.file))
  );
  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  return { findings, counts, total: findings.length };
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
    const stat = getDiffStat(startCommit);
    const result = runAuditPrefilter(files.length ? files : walkAllFiles('.'), stat);

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
      if (result.dispatch) {
        const run = Object.entries(result.dispatch).filter(([, v]) => v).map(([k]) => k);
        const skip = Object.entries(result.dispatch).filter(([, v]) => !v).map(([k]) => k);
        console.log(`\nReviewer dispatch: ${run.join(', ')}`);
        if (skip.length) console.log(`Skippable (auto): ${skip.join(', ')}`);
        console.log(`Security (aggressive opt-in only) in scope: ${result.gating.security}`);
      }
    }
    process.exit(result.findings.filter(f => f.severity === 'P0').length > 0 ? 1 : 0);
    break;
  }
  case 'audit-synthesis': {
    const list = (flag('--findings') || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!list.length) { console.error('audit-synthesis requires --findings <file1,file2,...>'); process.exit(1); }
    const result = runAuditSynthesis(list);
    if (jsonMode) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const c = result.counts;
      console.log(`Synthesized ${result.total} findings — P0 ${c.P0}, P1 ${c.P1}, P2 ${c.P2}, P3 ${c.P3}`);
      for (const f of result.findings) {
        const who = f.reviewers?.length ? ` (${f.reviewers.join(', ')})` : '';
        console.log(`  [${f.severity}] ${f.file}:${f.line ?? '?'} — ${f.issue || f.rule || f.title || ''}${who}`);
      }
    }
    process.exit(result.counts.P0 > 0 ? 1 : 0);
  }
  default: {
    console.error(`Unknown subcommand: ${subcommand}`);
    console.error('Use --help for usage.');
    process.exit(1);
  }
}
