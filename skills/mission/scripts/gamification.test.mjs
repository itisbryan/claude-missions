// Tests for the gamification engine: XP math, streaks, profile merge, signals, lessons.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const STATE = join(DIR, 'mission-state.mjs');
const ROOT = join(DIR, '../../..');

function ctx() {
  const dir = mkdtempSync(join(tmpdir(), 'gtest-'));
  const profile = join(dir, 'profile.json');
  return { dir, profile, env: { ...process.env, MISSION_PROFILE_PATH: profile } };
}
function run(c, args) {
  const r = spawnSync('node', [STATE, ...args], { cwd: c.dir, env: c.env, encoding: 'utf8', timeout: 20000 });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}
function get(c, field) { return run(c, ['get', field]).out.trim(); }
function setState(c, obj) {
  mkdirSync(join(c.dir, '.missions'), { recursive: true });
  writeFileSync(join(c.dir, '.missions/active-mission.json'), JSON.stringify(obj));
}
const gam = () => ({ totalXp: 0, scoringStreak: 0, longestStreak: 0, verdictCounts: { outstanding: 0, solid: 0, needs_improvement: 0, poor: 0, failed: 0 }, byRole: {}, byPhase: {}, userSignalCounts: { positive: 0, negative: 0, neutral: 0 }, userRating: null });
const base = (phases) => ({ description: 't', mode: 'standard', autonomy: 'high', startedAt: '2026-06-02T09:00:00.000Z', phases, gamification: gam(), performanceLog: [], userSignals: [], failureLog: [], progressLog: [] });
const after = (c) => () => rmSync(c.dir, { recursive: true, force: true });

test('XP math: composite 5.0 outstanding → 70 XP, recorded on role + total', (t) => {
  const c = ctx(); t.after(after(c));
  setState(c, base([{ name: 'Audit', status: 'active', startedAt: '2026-06-02T09:00:00.000Z' }]));
  run(c, ['score', '{"agent":"r1","role":"security_reviewer","phase":"Audit","scores":{"quality":5,"completeness":5,"efficiency":5}}']);
  assert.equal(get(c, 'gamification.totalXp'), '70');                     // round(5.0*10)+20
  assert.equal(get(c, 'gamification.byRole.security_reviewer.xp'), '70');
  assert.equal(get(c, 'gamification.verdictCounts.outstanding'), '1');
});

test('streak increments on a scoring phase that logged scores', (t) => {
  const c = ctx(); t.after(after(c));
  setState(c, base([
    { name: 'Audit', status: 'active', startedAt: '2026-06-02T09:00:00.000Z' },
    { name: 'Verify', status: 'pending' },
  ]));
  run(c, ['score', '{"agent":"r1","role":"reviewer","phase":"Audit","scores":{"quality":4,"completeness":4,"efficiency":4}}']);
  run(c, ['phase-transition']);
  assert.equal(get(c, 'gamification.scoringStreak'), '1');
  assert.equal(get(c, 'gamification.longestStreak'), '1');
  assert.equal(get(c, 'phases.0.status'), 'done');
  assert.equal(get(c, 'phases.1.status'), 'active');
});

test('streak resets when a scoring phase logs zero scores', (t) => {
  const c = ctx(); t.after(after(c));
  const st = base([
    { name: 'Implement', status: 'active', startedAt: '2026-06-02T09:00:00.000Z' },
    { name: 'Test', status: 'pending' },
  ]);
  st.gamification.scoringStreak = 2; st.gamification.longestStreak = 2;
  setState(c, st);
  run(c, ['phase-transition']);
  assert.equal(get(c, 'gamification.scoringStreak'), '0');
  assert.equal(get(c, 'gamification.longestStreak'), '2'); // longest preserved
});

test('user-signal applies delta + counts', (t) => {
  const c = ctx(); t.after(after(c));
  const st = base([{ name: 'Architect', status: 'active', startedAt: '2026-06-02T09:00:00.000Z' }]);
  st.gamification.byRole = { planner: { xp: 0, runs: 1, avgComposite: 4, sumComposite: 4, class: 'Mage' } };
  setState(c, st);
  run(c, ['user-signal', '{"role":"planner","phase":"Architect","type":"plan_revision"}']);
  assert.equal(get(c, 'gamification.totalXp'), '-10');
  assert.equal(get(c, 'gamification.userSignalCounts.negative'), '1');
  assert.equal(get(c, 'gamification.byRole.planner.xp'), '-10');
});

test('rate-mission distributes XP bonus per role', (t) => {
  const c = ctx(); t.after(after(c));
  const st = base([{ name: 'Audit', status: 'active', startedAt: '2026-06-02T09:00:00.000Z' }]);
  st.gamification.byRole = { worker: { xp: 0, runs: 2, avgComposite: 4, sumComposite: 8, class: 'Knight' } };
  setState(c, st);
  run(c, ['rate-mission', '{"rating":5}']);
  assert.equal(get(c, 'gamification.byRole.worker.xp'), '20');
  assert.equal(get(c, 'gamification.userRating.rating'), '5');
});

test('final phase-transition merges the mission into the career profile', (t) => {
  const c = ctx(); t.after(after(c));
  setState(c, base([{ name: 'Audit', status: 'active', startedAt: '2026-06-02T09:00:00.000Z' }]));
  run(c, ['score', '{"agent":"r1","role":"reviewer","phase":"Audit","scores":{"quality":4,"completeness":4,"efficiency":4}}']);
  run(c, ['phase-transition']); // final phase → merge profile + scorecard
  assert.ok(existsSync(c.profile), 'profile written');
  const p = JSON.parse(readFileSync(c.profile, 'utf8'));
  assert.equal(p.totalMissions, 1);
  assert.ok(p.byClass.Druid && p.byClass.Druid.runs >= 1, 'Druid class recorded');
  assert.equal(get(c, 'gamification') === '' ? '' : 'ok', 'ok'); // state still readable
});

test('lessons: add then retrieve', (t) => {
  const c = ctx(); t.after(after(c));
  run(c, ['lesson-add', 'Scout', 'always trace the middleware chain before reporting']);
  const list = run(c, ['lessons', 'Scout', '--list']).out;
  assert.match(list, /middleware chain/);
  const forced = run(c, ['lessons', 'Scout', '--force']).out;
  assert.match(forced, /middleware chain/);
});

test('bundle scripts parse (git-worktree + obsidian)', () => {
  for (const rel of [
    'skills/git-worktree/scripts/worktree-manager.mjs',
    'skills/obsidian/scripts/vault-index.mjs',
    'skills/obsidian/scripts/vault-audit.mjs',
    'skills/obsidian/scripts/todo-scan.mjs',
  ]) {
    const r = spawnSync('node', ['--check', join(ROOT, rel)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${rel} should parse: ${r.stderr}`);
  }
});
