#!/usr/bin/env node
// Guardrail harness for the mission skill scripts.
// Runs each guardrail in an isolated temp dir and prints PASS/FAIL + METRIC lines.
// METRIC guardrails_passed=<n>  (higher is better — the optimization target)
// METRIC crashes=<n>           (lower is better — secondary)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = '/Users/itisbryan/Desktop/personal/claude-missions/skills/mission/scripts';
const STATE = join(ROOT, 'mission-state.mjs');
const CHECKS = join(ROOT, 'mission-checks.mjs');

function tmp() { return mkdtempSync(join(tmpdir(), 'arh-')); }
function writeState(dir, obj) {
  mkdirSync(join(dir, '.missions'), { recursive: true });
  writeFileSync(join(dir, '.missions/active-mission.json'), JSON.stringify(obj));
}
function run(script, args, cwd) {
  const r = spawnSync('node', [script, ...args], { cwd, encoding: 'utf8', timeout: 20000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), crashed: r.status === null };
}
const hasStack = (s) => /\b(at\s+\w+.*:\d+:\d+|SyntaxError|TypeError|ReferenceError)\b/.test(s);

const baseState = () => ({
  description: 't', mode: 'standard', autonomy: 'medium', startedAt: '2026-06-02T09:00:00.000Z',
  phases: [{ name: 'Audit', emoji: '🔍', status: 'active', startedAt: '2026-06-02T09:00:00.000Z' }],
  gamification: { totalXp: 0, scoringStreak: 0, longestStreak: 0, verdictCounts: {}, byRole: {}, byPhase: {}, userSignalCounts: { positive: 0, negative: 0, neutral: 0 }, userRating: null },
  performanceLog: [], userSignals: [], failureLog: [],
});

const guardrails = [];
const G = (name, fn) => guardrails.push({ name, fn });

// --- graceful handling of malformed JSON args (no stack trace, nonzero exit) ---
for (const cmd of ['score', 'user-signal', 'failure', 'rate-mission', 'checkpoint-write']) {
  G(`malformed-json:${cmd}`, () => {
    const d = tmp(); writeState(d, baseState());
    const r = run(STATE, [cmd, '{bad json'], d);
    rmSync(d, { recursive: true, force: true });
    return r.code !== 0 && !hasStack(r.out);
  });
}

// --- score dimensions clamped to [1,5] so composite can't exceed bounds ---
G('score-dims-upper-clamp', () => {
  const d = tmp();
  const r = run(STATE, ['score-compute', '{"scores":{"quality":99,"completeness":99,"efficiency":99}}'], d);
  rmSync(d, { recursive: true, force: true });
  try { return JSON.parse(r.out).composite <= 5; } catch { return false; }
});
G('score-dims-lower-clamp', () => {
  const d = tmp();
  const r = run(STATE, ['score-compute', '{"scores":{"quality":-9,"completeness":0,"efficiency":-3}}'], d);
  rmSync(d, { recursive: true, force: true });
  try { const c = JSON.parse(r.out).composite; return c >= 1 && c <= 5; } catch { return false; }
});

// --- rate-mission rejects out-of-range ratings ---
G('rate-mission-range', () => {
  const d = tmp(); writeState(d, baseState());
  const r = run(STATE, ['rate-mission', '{"rating":9}'], d);
  rmSync(d, { recursive: true, force: true });
  return r.code !== 0 && !hasStack(r.out);
});

// --- prototype-pollution keys stripped from persisted profile ---
G('proto-pollution:save-model-defaults', () => {
  const d = tmp(); const profile = join(d, 'profile.json');
  const env = { ...process.env, MISSION_PROFILE_PATH: profile };
  const r = spawnSync('node', [STATE, 'save-model-defaults', '{"__proto__":{"x":1},"constructor":{"y":2},"explorer":"claude-haiku-4-5-20251001"}', '--tool', 'claude-code'],
    { cwd: d, encoding: 'utf8', env, timeout: 20000 });
  let ok = false;
  try {
    const txt = readFileSync(profile, 'utf8');
    ok = !txt.includes('__proto__') && !/"constructor"\s*:/.test(txt) && txt.includes('claude-haiku-4-5-20251001');
  } catch { ok = false; }
  rmSync(d, { recursive: true, force: true });
  return ok;
});

// --- git ref injection via state startCommit must NOT execute shell ---
G('git-injection:startCommit', () => {
  const d = tmp();
  spawnSync('git', ['init', '-q'], { cwd: d });
  spawnSync('git', ['commit', '--allow-empty', '-m', 'x', '-q'], { cwd: d, env: { ...process.env, GIT_AUTHOR_NAME: 'a', GIT_AUTHOR_EMAIL: 'a@a', GIT_COMMITTER_NAME: 'a', GIT_COMMITTER_EMAIL: 'a@a' } });
  const st = baseState(); st.startCommit = 'HEAD; touch PWNED';
  writeState(d, st);
  run(CHECKS, ['audit-prefilter', '--json'], d);
  const pwned = existsSync(join(d, 'PWNED'));
  rmSync(d, { recursive: true, force: true });
  return !pwned;
});

// --- git ref injection via --since flag must NOT execute shell ---
G('git-injection:since-flag', () => {
  const d = tmp();
  spawnSync('git', ['init', '-q'], { cwd: d });
  spawnSync('git', ['commit', '--allow-empty', '-m', 'x', '-q'], { cwd: d, env: { ...process.env, GIT_AUTHOR_NAME: 'a', GIT_AUTHOR_EMAIL: 'a@a', GIT_COMMITTER_NAME: 'a', GIT_COMMITTER_EMAIL: 'a@a' } });
  run(CHECKS, ['audit-prefilter', '--json', '--since', 'HEAD; touch PWNED2'], d);
  const pwned = existsSync(join(d, 'PWNED2'));
  rmSync(d, { recursive: true, force: true });
  return !pwned;
});

// --- corrupted state file → graceful error, no stack trace ---
G('corrupt-state-graceful', () => {
  const d = tmp(); mkdirSync(join(d, '.missions'), { recursive: true });
  writeFileSync(join(d, '.missions/active-mission.json'), '{not json');
  const r = run(STATE, ['status'], d);
  rmSync(d, { recursive: true, force: true });
  return r.code !== 0 && /reset/i.test(r.out) && !hasStack(r.out);
});

// --- progress-summary with empty phases array → no crash ---
G('progress-summary-empty-phases', () => {
  const d = tmp(); const st = baseState(); st.phases = [];
  writeState(d, st);
  const r = run(STATE, ['progress-summary'], d);
  rmSync(d, { recursive: true, force: true });
  return !r.crashed && !hasStack(r.out);
});

// --- failure-check missing arg → usage error, no crash ---
G('failure-check-missing-arg', () => {
  const d = tmp(); writeState(d, baseState());
  const r = run(STATE, ['failure-check'], d);
  rmSync(d, { recursive: true, force: true });
  return r.code !== 0 && !hasStack(r.out);
});

let passed = 0, crashes = 0;
for (const g of guardrails) {
  let ok = false;
  try { ok = g.fn(); } catch (e) { ok = false; }
  if (ok) passed++; else if (/crash/i.test(g.name)) crashes++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${g.name}`);
}
console.log(`METRIC guardrails_passed=${passed}`);
console.log(`METRIC guardrails_total=${guardrails.length}`);
console.log(`METRIC failures=${guardrails.length - passed}`);
