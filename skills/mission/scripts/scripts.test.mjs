// Regression tests for the mission scripts — guardrails, scoring contract, new commands.
// Run: node --test skills/mission/scripts/   (or `npm test`)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const STATE = join(DIR, 'mission-state.mjs');
const CHECKS = join(DIR, 'mission-checks.mjs');

const tmp = () => mkdtempSync(join(tmpdir(), 'mtest-'));
const hasStack = (s) => /\b(at\s+\w+.*:\d+:\d+|SyntaxError|TypeError|ReferenceError)\b/.test(s);
function run(script, args, opts = {}) {
  const r = spawnSync('node', [script, ...args], { encoding: 'utf8', timeout: 20000, ...opts });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '' };
}
function writeState(dir, obj) {
  mkdirSync(join(dir, '.missions'), { recursive: true });
  writeFileSync(join(dir, '.missions/active-mission.json'), JSON.stringify(obj));
}
const baseState = () => ({
  description: 't', mode: 'standard', autonomy: 'medium', startedAt: '2026-06-02T09:00:00.000Z',
  modelAssignment: { explorer: 'claude-haiku-4-5-20251001', planner: 'claude-opus-4-8', worker: 'claude-sonnet-4-6', business_reviewer: 'claude-sonnet-4-6', security_reviewer: 'claude-sonnet-4-6', edge_case_reviewer: 'claude-sonnet-4-6', reviewer: 'claude-sonnet-4-6', verifier: 'claude-sonnet-4-6' },
  phases: [{ name: 'Audit', emoji: '🔍', status: 'active', startedAt: '2026-06-02T09:00:00.000Z' }],
  gamification: { totalXp: 0, scoringStreak: 0, longestStreak: 0, verdictCounts: {}, byRole: {}, byPhase: {}, userSignalCounts: { positive: 0, negative: 0, neutral: 0 }, userRating: null },
  performanceLog: [], userSignals: [], failureLog: [],
});

test('scripts parse', () => {
  assert.equal(run(STATE, []).code, 0);        // no-arg prints command list
  assert.equal(run(CHECKS, ['--help']).code, 0);
});

test('scoring contract: composite/verdict/XP derived from raw dims', () => {
  const r = run(STATE, ['score-compute', '{"agent":"x","scores":{"quality":4,"completeness":3,"efficiency":5}}']);
  const d = JSON.parse(r.out);
  assert.equal(d.composite, 3.9);
  assert.equal(d.verdict, 'solid');
  assert.equal(d.xp, 49);
});

test('score dimensions clamped to [1,5]', () => {
  assert.ok(JSON.parse(run(STATE, ['score-compute', '{"scores":{"quality":99,"completeness":99,"efficiency":99}}']).out).composite <= 5);
  const lo = JSON.parse(run(STATE, ['score-compute', '{"scores":{"quality":-9,"completeness":0,"efficiency":-3}}']).out).composite;
  assert.ok(lo >= 1 && lo <= 5);
});

for (const cmd of ['score', 'user-signal', 'failure', 'rate-mission', 'checkpoint-write']) {
  test(`malformed JSON to ${cmd} fails gracefully`, () => {
    const d = tmp(); writeState(d, baseState());
    const r = run(STATE, [cmd, '{bad json'], { cwd: d });
    rmSync(d, { recursive: true, force: true });
    assert.notEqual(r.code, 0);
    assert.ok(!hasStack(r.out), 'no stack trace');
  });
}

test('prototype-pollution keys stripped from saved profile', () => {
  const d = tmp(); const profile = join(d, 'profile.json');
  run(STATE, ['save-model-defaults', '{"__proto__":{"x":1},"constructor":{"y":2},"explorer":"claude-haiku-4-5-20251001"}', '--tool', 'claude-code'], { cwd: d, env: { ...process.env, MISSION_PROFILE_PATH: profile } });
  const txt = run(STATE, ['load-model-defaults', '--tool', 'claude-code'], { cwd: d, env: { ...process.env, MISSION_PROFILE_PATH: profile } }).out;
  rmSync(d, { recursive: true, force: true });
  assert.ok(!txt.includes('__proto__') && !/"constructor"\s*:/.test(txt));
  assert.ok(txt.includes('claude-haiku-4-5-20251001'));
});

test('score-batch rejects oversized arrays', () => {
  const d = tmp(); writeState(d, baseState());
  const big = JSON.stringify(Array.from({ length: 1001 }, () => ({ role: 'worker', phase: 'Audit', scores: { quality: 3, completeness: 3, efficiency: 3 } })));
  const r = run(STATE, ['score-batch', big], { cwd: d });
  rmSync(d, { recursive: true, force: true });
  assert.notEqual(r.code, 0);
});

test('doctor validates state', () => {
  const ok = tmp(); writeState(ok, baseState());
  assert.equal(JSON.parse(run(STATE, ['doctor'], { cwd: ok }).out).verdict, 'ok');
  rmSync(ok, { recursive: true, force: true });
  const bad = tmp(); const st = baseState(); delete st.autonomy; delete st.modelAssignment.verifier; writeState(bad, st);
  const r = run(STATE, ['doctor'], { cwd: bad });
  const d = JSON.parse(r.out);
  rmSync(bad, { recursive: true, force: true });
  assert.equal(d.verdict, 'issues');
  assert.ok(d.issues.some(i => /autonomy/.test(i)) && d.issues.some(i => /verifier/.test(i)));
});

test('parse-usage extracts metrics from a usage block', () => {
  const d = JSON.parse(run(STATE, ['parse-usage', 'subagent_tokens: 21,082\ntool_uses: 8\nduration_ms: 31591']).out);
  assert.equal(d.totalTokens, 21082);
  assert.equal(d.toolUses, 8);
  assert.equal(d.durationMs, 31591);
});

test('audit-synthesis merges + dedups by file:line, keeps highest severity', () => {
  const d = tmp();
  writeFileSync(join(d, 'r1.json'), JSON.stringify([{ file: 'a.js', line: 10, severity: 'P2', issue: 'n+1 query', reviewer: 'perf' }, { file: 'b.js', line: 3, severity: 'P0', issue: 'sql injection', reviewer: 'security' }]));
  writeFileSync(join(d, 'r2.json'), JSON.stringify([{ file: 'a.js', line: 10, severity: 'P1', issue: 'n+1 query', reviewer: 'arch' }]));
  const res = JSON.parse(run(CHECKS, ['audit-synthesis', '--json', '--findings', `${join(d, 'r1.json')},${join(d, 'r2.json')}`]).out);
  rmSync(d, { recursive: true, force: true });
  assert.equal(res.total, 2);                       // a.js:10 deduped
  assert.equal(res.findings[0].severity, 'P0');      // sorted P0 first
  const merged = res.findings.find(f => f.file === 'a.js');
  assert.equal(merged.severity, 'P1');               // highest of P2/P1 kept
  assert.deepEqual(merged.reviewers.sort(), ['arch', 'perf']);
});

test('git ref injection via --since does not execute shell', () => {
  const d = tmp();
  spawnSync('git', ['init', '-q'], { cwd: d });
  spawnSync('git', ['commit', '--allow-empty', '-m', 'x', '-q'], { cwd: d, env: { ...process.env, GIT_AUTHOR_NAME: 'a', GIT_AUTHOR_EMAIL: 'a@a', GIT_COMMITTER_NAME: 'a', GIT_COMMITTER_EMAIL: 'a@a' } });
  run(CHECKS, ['audit-prefilter', '--json', '--since', 'HEAD; touch PWNED'], { cwd: d });
  const pwned = existsSync(join(d, 'PWNED'));
  rmSync(d, { recursive: true, force: true });
  assert.ok(!pwned, 'no command injection');
});
