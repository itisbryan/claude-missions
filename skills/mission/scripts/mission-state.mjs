#!/usr/bin/env node
// Mission state operations — atomic JSON read/write without LLM tokens
// Usage: node mission-state.mjs <command> [args]
// Zero dependencies

import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, renameSync } from 'fs';
import path from 'path';
import os from 'os';

const STATE_FILE = '.claude/missions/active-mission.json';
const CHECKPOINT_FILE = '.claude/missions/subagent-checkpoint.json';

function die(msg) { console.error(`Error: ${msg}`); process.exit(1); }

function readState() {
  if (!existsSync(STATE_FILE)) die('No active mission (state file not found)');
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); }
  catch { die('State file is corrupted JSON. Run /mission reset.'); }
}

function writeState(state) {
  const tmp = STATE_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, STATE_FILE);
}

function now() { return new Date().toISOString(); }

function phaseIcon(status) {
  return { done: '\u2705', active: '\uD83D\uDD04', skipped: '\u23ED\uFE0F', pending: '\u2B1C' }[status] || '\u2B1C';
}

function formatDuration(start, end) {
  const ms = new Date(end || new Date()) - new Date(start);
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (mins > 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

// ── Persona / class map ──────────────────────────────────────────────────────
const PERSONAS = {
  explorer:           { class: 'Scout',   emoji: '🔭' },
  planner:            { class: 'Mage',    emoji: '🧙' },
  worker:             { class: 'Knight',  emoji: '⚔️' },
  security_reviewer:  { class: 'Rogue',   emoji: '🗡️' },
  business_reviewer:  { class: 'Cleric',  emoji: '📜' },
  edge_case_reviewer: { class: 'Ranger',  emoji: '🎯' },
  reviewer:           { class: 'Druid',   emoji: '🌿' },
  verifier:           { class: 'Paladin', emoji: '🛡️' },
};
function personaFor(role) { return PERSONAS[role] || { class: role, emoji: '❓' }; }

const SCORING_PHASES = new Set(['Architect', 'Plan', 'Implement', 'Build', 'Audit']);

const VERDICT_BONUS = { outstanding: 20, solid: 10, needs_improvement: 0, poor: -5, failed: -10 };
const VERDICT_EMOJI = { outstanding: '🏆', solid: '👏', needs_improvement: '📝', poor: '⚠️', failed: '🔴' };
function verdictKey(v) { return (v || '').toLowerCase().replace(/\s+/g, '_'); }
function xpFor(entry) {
  const comp = entry.scores?.composite || 0;
  const v = verdictKey(entry.verdict);
  return Math.round(comp * 10) + (VERDICT_BONUS[v] ?? 0);
}

function defaultGamification() {
  return {
    totalXp: 0, scoringStreak: 0, longestStreak: 0,
    verdictCounts: { outstanding: 0, solid: 0, needs_improvement: 0, poor: 0, failed: 0 },
    byRole: {}, byPhase: {},
    userSignalCounts: { positive: 0, negative: 0, neutral: 0 },
    userRating: null,
  };
}

const USER_SIGNAL_TYPES = {
  approval_first_try:    { delta: +15 },
  audit_approved:        { delta: +10 },
  phase_approved:        { delta: +5  },
  silent_run:            { delta: +10 },
  work_item_thumbs_up:   { delta: +3  },
  plan_revision:         { delta: -10 },
  dispute_finding:       { delta: -5  },
  correction:            { delta: -10 },
  work_item_thumbs_down: { delta: -5  },
  reset_mid_flow:        { delta: -20 },
};

const LESSON_CAP = 15;
const LOW_SCORE_THRESHOLD = 2.5;
const INJECT_WINDOW = 3;
const INJECT_THRESHOLD = 3.5;
const RATING_XP = { 5: 20, 4: 10, 3: 0, 2: -10, 1: -20 };

// ── Global profile helpers ───────────────────────────────────────────────────
function profilePath() {
  if (process.env.MISSION_PROFILE_PATH) return path.resolve(process.env.MISSION_PROFILE_PATH);
  return path.join(os.homedir(), '.claude', 'mission-profile.json');
}

function readProfile() {
  const p = profilePath();
  if (!existsSync(p)) {
    return {
      totalMissions: 0, totalXp: 0, bestStreak: 0,
      firstSeenAt: now(), lastUpdatedAt: now(),
      projects: [], byClass: {},
      verdictCounts: { outstanding: 0, solid: 0, needs_improvement: 0, poor: 0, failed: 0 },
      userSignalsCareer: { total: 0, positive: 0, negative: 0, byType: {} },
      userRatings: { count: 0, sum: 0, recent: [] },
    };
  }
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch { die(`Global profile ${p} is corrupted. Back it up and delete to reset.`); }
}

function writeProfileAtomic(profile) {
  const p = profilePath();
  mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  writeFileSync(tmp, JSON.stringify(profile, null, 2));
  renameSync(tmp, p);
}

function defaultClassSlot() {
  return { xp: 0, runs: 0, sumComposite: 0, missions: 0, recent: [], lessons: [] };
}

function maybeCaptureLesson(profile, className, text, source, state) {
  if (!text || text.trim().length < 10) return;
  const normalized = text.trim().toLowerCase();
  profile.byClass[className] = profile.byClass[className] || defaultClassSlot();
  const slot = profile.byClass[className];
  slot.lessons = slot.lessons || [];
  if (slot.lessons.some(l => l.text.trim().toLowerCase() === normalized)) return;
  const nextId = `${className}-${String(slot.lessons.length + 1).padStart(3, '0')}`;
  slot.lessons.push({
    id: nextId, text: text.trim().slice(0, 200), source,
    addedAt: now(), project: path.basename(process.cwd()),
    mission: state?.description || null,
  });
  if (slot.lessons.length > LESSON_CAP) slot.lessons.shift();
}

function mergeMissionIntoProfile(state) {
  const profile = readProfile();
  const g = state.gamification || {};
  profile.totalMissions += 1;
  profile.totalXp += (g.totalXp || 0);
  profile.bestStreak = Math.max(profile.bestStreak || 0, g.longestStreak || 0);
  profile.lastUpdatedAt = now();
  const projName = path.basename(process.cwd());
  if (!profile.projects.includes(projName)) profile.projects.push(projName);
  profile.byClass = profile.byClass || {};
  for (const [role, rs] of Object.entries(g.byRole || {})) {
    const { class: className } = personaFor(role);
    const slot = profile.byClass[className] = profile.byClass[className] || defaultClassSlot();
    slot.xp += (rs.xp || 0);
    slot.runs += (rs.runs || 0);
    slot.sumComposite += (rs.sumComposite || 0);
    slot.missions += 1;
    slot.recent = slot.recent || [];
    if (rs.avgComposite) { slot.recent.push(rs.avgComposite); if (slot.recent.length > 10) slot.recent.shift(); }
  }
  for (const [v, n] of Object.entries(g.verdictCounts || {})) {
    profile.verdictCounts[v] = (profile.verdictCounts[v] || 0) + n;
  }
  profile.userSignalsCareer = profile.userSignalsCareer || { total: 0, positive: 0, negative: 0, byType: {} };
  for (const sig of state.userSignals || []) {
    profile.userSignalsCareer.total += 1;
    if (sig.delta > 0) profile.userSignalsCareer.positive += 1;
    else if (sig.delta < 0) profile.userSignalsCareer.negative += 1;
    const t = sig.type || 'unknown';
    profile.userSignalsCareer.byType[t] = (profile.userSignalsCareer.byType[t] || 0) + 1;
  }
  profile.userRatings = profile.userRatings || {};
  profile.userRatings.count  = profile.userRatings.count  || 0;
  profile.userRatings.sum    = profile.userRatings.sum    || 0;
  profile.userRatings.recent = profile.userRatings.recent || [];
  if (state.userRating?.rating) {
    profile.userRatings.count += 1;
    profile.userRatings.sum += state.userRating.rating;
    profile.userRatings.recent.unshift({ rating: state.userRating.rating, comment: state.userRating.comment, project: projName, timestamp: state.userRating.timestamp });
    profile.userRatings.recent = profile.userRatings.recent.slice(0, 10);
  }
  writeProfileAtomic(profile);
  return profile;
}

// ── applyScoreEntry — shared by score + score-batch ─────────────────────────
function applyScoreEntry(state, entry) {
  state.performanceLog = state.performanceLog || [];
  state.gamification = state.gamification || defaultGamification();
  const g = state.gamification;
  entry.timestamp = now();
  state.performanceLog.push(entry);
  const xp = xpFor(entry);
  const v = verdictKey(entry.verdict);
  const role = entry.role || 'unknown';
  const phase = entry.phase || 'unknown';
  const { class: className } = personaFor(role);
  g.totalXp = (g.totalXp || 0) + xp;
  g.verdictCounts[v] = (g.verdictCounts[v] || 0) + 1;
  g.byRole[role] = g.byRole[role] || { xp: 0, runs: 0, avgComposite: 0, sumComposite: 0, class: className };
  const rs = g.byRole[role];
  rs.xp += xp; rs.runs += 1;
  rs.sumComposite = (rs.sumComposite || 0) + (entry.scores?.composite || 0);
  rs.avgComposite = rs.sumComposite / rs.runs;
  g.byPhase[phase] = g.byPhase[phase] || { expected: null, scored: 0, xp: 0, verdicts: [], party: [] };
  const ps = g.byPhase[phase];
  ps.scored += 1; ps.xp += xp;
  ps.verdicts.push(VERDICT_EMOJI[v] || '?');
  ps.party.push(`${personaFor(role).emoji} ${className}`);
  if ((entry.scores?.composite || 0) < LOW_SCORE_THRESHOLD && entry.feedback) {
    try {
      const profile = readProfile();
      maybeCaptureLesson(profile, className, entry.feedback, 'low_score_feedback', state);
      writeProfileAtomic(profile);
    } catch { /* non-fatal */ }
  }
}

// ── Scorecard printer (to stderr) ────────────────────────────────────────────
function printScorecard(state, profile) {
  const g = state.gamification || defaultGamification();
  const log = state.performanceLog || [];
  const totalTokens = log.reduce((a, e) => a + (e.usage?.totalTokens || 0), 0);
  const missionXp = g.totalXp || 0;
  const userSignalXp = (state.userSignals || []).reduce((a, s) => a + (s.delta || 0), 0);
  const ratingXp = state.userRating?.rating ? (RATING_XP[state.userRating.rating] ?? 0) : 0;
  const roles = Object.entries(g.byRole || {}).filter(([, r]) => r.runs >= 2);
  let mvp = null, weakest = null;
  for (const [role] of roles) {
    const avg = g.byRole[role].avgComposite || 0;
    if (!mvp || avg > (g.byRole[mvp]?.avgComposite || 0)) mvp = role;
    if (!weakest || avg < (g.byRole[weakest]?.avgComposite || 0)) weakest = role;
  }
  const vc = g.verdictCounts || {};
  const verdictLine = ['outstanding','solid','needs_improvement','poor','failed']
    .filter(k => vc[k]).map(k => `${VERDICT_EMOJI[k]} x${vc[k]}`).join('  ') || 'none';
  const partyParts = Object.entries(g.byRole || {}).map(([role, r]) => {
    const { emoji, class: cls } = personaFor(role);
    return `${emoji} ${cls}${r.runs > 1 ? ` x${r.runs}` : ''}`;
  });
  const us = state.userSignals || [];
  const posC = us.filter(s => (s.delta||0) > 0).length;
  const negC = us.filter(s => (s.delta||0) < 0).length;
  let ratingLine = 'none';
  if (state.userRating?.skipReason === 'high_autonomy') ratingLine = 'skipped (high autonomy)';
  else if (state.userRating?.rating) ratingLine = `${state.userRating.rating}/5${state.userRating.comment ? ` — "${state.userRating.comment}"` : ''}`;

  const se = process.stderr;
  se.write('\n═══ Mission Scorecard ═══\n');
  se.write('This mission\n');
  se.write(`  XP earned:      ${missionXp}   (orch ${missionXp - userSignalXp - ratingXp} · user signals ${userSignalXp} · rating ${ratingXp})\n`);
  se.write(`  Scoring streak: ${g.longestStreak || 0} phases (longest this mission)\n`);
  se.write(`  Verdicts:       ${verdictLine}\n`);
  se.write(`  Party roster:   ${partyParts.join(' · ') || 'none'}\n`);
  if (mvp) { const r = g.byRole[mvp]; se.write(`  MVP:            ${personaFor(mvp).emoji} ${personaFor(mvp).class} — avg ${r.avgComposite?.toFixed(1)}/5 over ${r.runs} runs, ${r.xp} XP\n`); }
  if (weakest && weakest !== mvp) { const r = g.byRole[weakest]; se.write(`  Needs training: ${personaFor(weakest).emoji} ${personaFor(weakest).class} — avg ${r.avgComposite?.toFixed(1)}/5 over ${r.runs} runs\n`); }
  se.write(`  User signals:   ${us.length ? `+${posC} / -${negC}` : 'none this mission'}\n`);
  se.write(`  User rating:    ${ratingLine}\n`);
  se.write(`  Total tokens:   ${totalTokens.toLocaleString()}\n`);
  if (profile) {
    se.write('\nCareer (after this mission)\n');
    se.write(`  Missions:       ${profile.totalMissions}\n`);
    se.write(`  Total XP:       ${profile.totalXp.toLocaleString()}   (+${missionXp} this mission)\n`);
    se.write(`  Best streak:    ${profile.bestStreak} phases\n`);
    const topEntry = Object.entries(profile.byClass || {}).sort(([,a],[,b])=>(b.xp||0)-(a.xp||0))[0];
    if (topEntry) { const [cls, slot] = topEntry; const { emoji } = Object.values(PERSONAS).find(p => p.class === cls) || { emoji: '?' }; se.write(`  Top class:      ${emoji} ${cls} — ${slot.xp} XP career\n`); }
    const rAvg = profile.userRatings?.count ? (profile.userRatings.sum / profile.userRatings.count).toFixed(1) : '—';
    se.write(`  Avg user rating:${rAvg}/5 over ${profile.userRatings?.count || 0} rated missions\n`);
    se.write('  See full profile: node scripts/mission-state.mjs profile\n');
  }
  se.write('\n');
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) { console.log('Commands: status, phase-transition, pause, resume, log, score, score-batch, user-signal, rate-mission, lessons, lesson-add, lesson-remove, profile, failure, tokens, get, checkpoint-write, checkpoint-read, checkpoint-clear'); process.exit(0); }

switch (cmd) {
  case 'status': {
    const s = readState();
    const status = s.completedAt ? 'COMPLETE' : s.paused ? 'PAUSED' : 'IN PROGRESS';
    console.log(`\n## Mission: ${s.description}`);
    console.log(`**Status:** ${status}`);
    console.log(`**Mode:** ${s.mode} | **Autonomy:** ${s.autonomy} | **Template:** ${s.template || 'custom'}`);
    console.log(`**Elapsed:** ${formatDuration(s.startedAt)}\n`);
    console.log('### Phases\n');
    for (const p of s.phases) {
      const dur = p.completedAt && p.startedAt ? ` (${formatDuration(p.startedAt, p.completedAt)})` : '';
      const cur = p.status === 'active' ? ' \u2190 CURRENT' : '';
      console.log(`${phaseIcon(p.status)} ${p.emoji} ${p.name}${cur}${dur}`);
    }
    console.log('\n### Recent Activity\n');
    const recent = (s.progressLog || []).slice(-5);
    for (const e of recent) console.log(`- [${e.timestamp}] ${e.detail}`);
    console.log('');
    break;
  }

  case 'phase-transition': {
    const s = readState();
    const ts = now();
    s.gamification = s.gamification || defaultGamification();
    const g = s.gamification;
    const idx = s.phases.findIndex(p => p.status === 'active');
    if (idx === -1) die('No active phase found');
    const phase = s.phases[idx];
    const isFinalPhase = idx + 1 >= s.phases.length;

    // Gamification readout
    const phaseEntries = (s.performanceLog || []).filter(e => e.phase === phase.name);
    if (SCORING_PHASES.has(phase.name)) {
      if (phaseEntries.length === 0) {
        const prevStreak = g.scoringStreak;
        g.scoringStreak = 0;
        process.stderr.write(`\n⚠️  Scoring skipped for ${phase.name} — streak reset from ${prevStreak} → 0.\n`);
        process.stderr.write(`    The party fell silent. No XP earned. Backfill before next dispatch.\n\n`);
      } else {
        const avg = phaseEntries.reduce((a, e) => a + (e.scores?.composite || 0), 0) / phaseEntries.length;
        const xpEarned = phaseEntries.reduce((a, e) => a + xpFor(e), 0);
        const badges = phaseEntries.map(e => VERDICT_EMOJI[verdictKey(e.verdict)] || '?').join('');
        const partyEmoji = phaseEntries.map(e => personaFor(e.role).emoji).join('');
        const distinctClasses = [...new Set(phaseEntries.map(e => personaFor(e.role).class))];
        g.scoringStreak = (g.scoringStreak || 0) + 1;
        g.longestStreak = Math.max(g.longestStreak || 0, g.scoringStreak);
        process.stderr.write(`\n🎉 ${phase.name} scored: ${phaseEntries.length}/${phaseEntries.length} agents, avg ${avg.toFixed(1)}/5 ${badges}\n`);
        process.stderr.write(`   Party: ${partyEmoji}  (${distinctClasses.join(', ')})\n`);
        process.stderr.write(`   +${xpEarned} XP (total ${g.totalXp}) · streak ${g.scoringStreak} 🔥\n`);
        for (const role of [...new Set(phaseEntries.map(e => e.role))]) {
          const p = personaFor(role);
          const roleEntries = phaseEntries.filter(e => e.role === role);
          const curAvg = roleEntries.reduce((a, e) => a + (e.scores?.composite || 0), 0) / roleEntries.length;
          const priorEntries = (s.performanceLog || []).filter(e => e.role === role && e.phase !== phase.name);
          const priorAvg = priorEntries.length > 0 ? priorEntries.reduce((a, e) => a + (e.scores?.composite || 0), 0) / priorEntries.length : null;
          const delta = priorAvg !== null ? curAvg - priorAvg : null;
          const arrow = delta === null ? '→' : delta > 0.1 ? '↑' : delta < -0.1 ? '↓' : '→';
          const deltaStr = delta !== null ? ` (${arrow} ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} vs prior)` : ' (first run)';
          process.stderr.write(`   ${p.emoji} ${p.class}: ${curAvg.toFixed(1)}/5${deltaStr}\n`);
        }
        process.stderr.write('\n');
      }
    }

    const phaseSignals = (s.userSignals || []).filter(sig => sig.phase === phase.name);
    if (phaseSignals.length > 0) {
      const sigXp = phaseSignals.reduce((a, s) => a + (s.delta || 0), 0);
      process.stderr.write(`   User signals this phase: ${phaseSignals.length} (${sigXp >= 0 ? '+' : ''}${sigXp} XP)\n\n`);
    }

    if (isFinalPhase) {
      if (s.autonomy === 'high') {
        const hasNegative = (s.userSignals || []).some(sig => (sig.delta || 0) < 0);
        if (!hasNegative) {
          for (const role of Object.keys(g.byRole || {})) {
            const sigEntry = { role, phase: phase.name, type: 'silent_run', delta: USER_SIGNAL_TYPES.silent_run.delta, context: 'Auto-awarded: high autonomy, zero negative signals', timestamp: ts };
            s.userSignals = s.userSignals || [];
            s.userSignals.push(sigEntry);
            g.totalXp += sigEntry.delta;
            if (g.byRole[role]) g.byRole[role].xp += sigEntry.delta;
          }
        }
      }
      const profile = mergeMissionIntoProfile(s);
      printScorecard(s, profile);
    }

    phase.status = 'done';
    phase.completedAt = ts;
    if (!isFinalPhase) {
      const next = s.phases[idx + 1];
      next.status = 'active';
      next.startedAt = ts;
      s.progressLog.push({ timestamp: ts, type: 'phase_complete', detail: `${phase.name} complete` });
      writeState(s);
      console.log(`Phase transition: ${phase.name} → ${next.name}`);
    } else {
      s.completedAt = ts;
      s.progressLog.push({ timestamp: ts, type: 'mission_complete', detail: `${phase.name} complete — mission finished` });
      writeState(s);
      console.log(`Mission complete! Final phase: ${phase.name}`);
    }
    break;
  }

  case 'pause': {
    const s = readState();
    const ts = now();
    s.paused = true;
    s.pausedAt = ts;
    s.progressLog.push({ timestamp: ts, type: 'mission_pause', detail: 'Mission paused' });
    writeState(s);
    console.log('Mission paused.');
    break;
  }

  case 'resume': {
    const s = readState();
    const ts = now();
    if (s.pausedAt) {
      s.pauseHistory = s.pauseHistory || [];
      s.pauseHistory.push({ pausedAt: s.pausedAt, resumedAt: ts });
    }
    s.paused = false;
    delete s.pausedAt;
    s.progressLog.push({ timestamp: ts, type: 'mission_resume', detail: 'Mission resumed' });
    writeState(s);
    console.log('Mission resumed.');
    break;
  }

  case 'log': {
    const s = readState();
    console.log(`\n## Mission Log: ${s.description}`);
    console.log(`Started: ${s.startedAt} | Elapsed: ${formatDuration(s.startedAt)}\n`);
    for (const e of (s.progressLog || [])) console.log(`[${e.timestamp}] ${e.detail}`);
    console.log('\n### Phase Durations\n');
    for (const p of s.phases) {
      if (p.status === 'done' && p.startedAt && p.completedAt) {
        console.log(`- ${p.name}: ${formatDuration(p.startedAt, p.completedAt)}`);
      } else if (p.status === 'active' && p.startedAt) {
        console.log(`- ${p.name}: in progress (${formatDuration(p.startedAt)} so far)`);
      } else if (p.status === 'skipped') {
        console.log(`- ${p.name}: skipped`);
      } else {
        console.log(`- ${p.name}: pending`);
      }
    }
    console.log('');
    break;
  }

  case 'score': {
    const entry = JSON.parse(args[0] || '{}');
    const s = readState();
    applyScoreEntry(s, entry);
    writeState(s);
    console.log(`Scored ${entry.agent}: ${entry.scores?.composite || '?'}/5 (+${xpFor(entry)} XP)`);
    break;
  }

  case 'score-batch': {
    let entries;
    try { entries = JSON.parse(args[0] || '[]'); }
    catch { die('score-batch requires a JSON array'); }
    if (!Array.isArray(entries)) die('score-batch requires an array');
    const s = readState();
    for (const entry of entries) applyScoreEntry(s, entry);
    writeState(s);
    const batchXp = entries.reduce((a, e) => a + xpFor(e), 0);
    console.log(`Scored ${entries.length} agents · phase XP +${batchXp}`);
    break;
  }

  case 'user-signal': {
    const entry = JSON.parse(args[0] || '{}');
    if (!entry.type) die('user-signal requires a type field');
    const s = readState();
    s.gamification = s.gamification || defaultGamification();
    s.userSignals = s.userSignals || [];
    const defaults = USER_SIGNAL_TYPES[entry.type] || {};
    const delta = entry.delta !== undefined ? entry.delta : (defaults.delta || 0);
    const sig = { ...entry, delta, timestamp: now() };
    s.userSignals.push(sig);
    s.gamification.totalXp = (s.gamification.totalXp || 0) + delta;
    const role = entry.role;
    if (role && s.gamification.byRole[role]) s.gamification.byRole[role].xp = (s.gamification.byRole[role].xp || 0) + delta;
    const gc = s.gamification.userSignalCounts = s.gamification.userSignalCounts || { positive: 0, negative: 0, neutral: 0 };
    if (delta > 0) gc.positive++; else if (delta < 0) gc.negative++; else gc.neutral++;
    if (entry.type === 'correction' && entry.context) {
      try {
        const { class: className } = personaFor(entry.role || 'unknown');
        const profile = readProfile();
        maybeCaptureLesson(profile, className, entry.context, 'user_correction', s);
        writeProfileAtomic(profile);
      } catch { /* non-fatal */ }
    }
    writeState(s);
    console.log(`User signal logged: ${entry.type} (${delta >= 0 ? '+' : ''}${delta} XP) for ${entry.role || 'unknown'}`);
    break;
  }

  case 'rate-mission': {
    const entry = JSON.parse(args[0] || '{}');
    const s = readState();
    s.gamification = s.gamification || defaultGamification();
    const ts = now();
    if (entry.skipReason) {
      s.userRating = { rating: null, skipReason: entry.skipReason, timestamp: ts };
      writeState(s);
      console.log(`Mission rating skipped (${entry.skipReason})`);
    } else {
      const rating = entry.rating;
      if (![1,2,3,4,5].includes(rating)) die('rate-mission requires rating 1-5');
      const bonus = RATING_XP[rating] ?? 0;
      for (const role of Object.keys(s.gamification.byRole)) {
        s.gamification.byRole[role].xp = (s.gamification.byRole[role].xp || 0) + bonus;
        s.gamification.totalXp = (s.gamification.totalXp || 0) + bonus;
      }
      s.userRating = { rating, comment: entry.comment || null, timestamp: ts };
      s.gamification.userRating = s.userRating;
      writeState(s);
      console.log(`Mission rated ${rating}/5${entry.comment ? ` — "${entry.comment}"` : ''} · ${bonus >= 0 ? '+' : ''}${bonus} XP per class`);
    }
    break;
  }

  case 'lessons': {
    const className = args[0];
    const flags = new Set(args.slice(1));
    if (!className) die('Usage: mission-state.mjs lessons <Class> [--force] [--list]');
    const profile = readProfile();
    const slot = profile.byClass[className] || defaultClassSlot();
    if (flags.has('--list')) { console.log(JSON.stringify(slot.lessons || [], null, 2)); break; }
    const recent = slot.recent || [];
    const windowAvg = recent.length >= INJECT_WINDOW ? recent.slice(-INJECT_WINDOW).reduce((a,b)=>a+b,0) / INJECT_WINDOW : null;
    const shouldInject = flags.has('--force') || (windowAvg !== null && windowAvg < INJECT_THRESHOLD);
    if (!shouldInject) { console.log('[]'); break; }
    const top = (slot.lessons || []).slice(-3);
    console.log(JSON.stringify(top.map(l => ({ id: l.id, text: l.text })), null, 2));
    break;
  }

  case 'lesson-add': {
    const className = args[0];
    const text = args[1];
    if (!className || !text) die('Usage: mission-state.mjs lesson-add <Class> "<text>"');
    const profile = readProfile();
    const s = existsSync(STATE_FILE) ? readState() : null;
    maybeCaptureLesson(profile, className, text, 'manual', s);
    writeProfileAtomic(profile);
    const slot = profile.byClass[className];
    const last = (slot?.lessons || []).slice(-1)[0];
    console.log(`Lesson added: ${last?.id || 'unknown'} — "${text.slice(0, 60)}"`);
    break;
  }

  case 'lesson-remove': {
    const className = args[0];
    const id = args[1];
    if (!className || !id) die('Usage: mission-state.mjs lesson-remove <Class> <id>');
    const profile = readProfile();
    const slot = profile.byClass[className];
    if (!slot?.lessons) die(`No lessons found for class ${className}`);
    const before = slot.lessons.length;
    slot.lessons = slot.lessons.filter(l => l.id !== id);
    if (slot.lessons.length === before) die(`Lesson ${id} not found for class ${className}`);
    writeProfileAtomic(profile);
    console.log(`Lesson ${id} removed from ${className}`);
    break;
  }

  case 'profile': {
    const p = profilePath();
    if (!existsSync(p)) { console.log('No profile yet — finish a mission to start your career.'); process.exit(0); }
    const profile = readProfile();
    const cols = Object.entries(profile.byClass || {}).sort(([,a],[,b]) => (b.xp||0)-(a.xp||0));
    console.log('\n═══ Persona Profile (career) ═══');
    console.log(`Missions completed: ${profile.totalMissions}        Total XP: ${profile.totalXp.toLocaleString()}        Longest streak: ${profile.bestStreak}`);
    console.log(`Projects: ${(profile.projects || []).join(', ') || 'none'}\n`);
    console.log('Class Roster');
    console.log('| Class     | Emoji | XP      | Runs | Avg  | Missions |');
    console.log('|-----------|-------|---------|------|------|----------|');
    for (const [cls, slot] of cols) {
      const { emoji } = Object.values(PERSONAS).find(p => p.class === cls) || { emoji: '?' };
      const avg = slot.runs > 0 ? (slot.sumComposite / slot.runs).toFixed(1) : '—';
      console.log(`| ${cls.padEnd(9)} | ${String(emoji).padEnd(5)} | ${String(slot.xp).padStart(7)} | ${String(slot.runs).padStart(4)} | ${String(avg).padStart(4)} | ${String(slot.missions).padStart(8)} |`);
    }
    const vc = profile.verdictCounts || {};
    const verdictLine = ['outstanding','solid','needs_improvement','poor','failed'].filter(k => vc[k]).map(k => `${VERDICT_EMOJI[k]} x${vc[k]}`).join('   ') || 'none';
    console.log(`\nVerdicts (career)\n${verdictLine}`);
    if (profile.userRatings?.count > 0) { const avg = (profile.userRatings.sum / profile.userRatings.count).toFixed(1); console.log(`\nAvg user rating: ${avg}/5 over ${profile.userRatings.count} rated missions`); }
    console.log('');
    break;
  }

  case 'failure': {
    const entry = JSON.parse(args[0] || '{}');
    const s = readState();
    s.failureLog = s.failureLog || [];
    const ts = now();
    const existing = s.failureLog.find(f => f.workItem === entry.workItem);
    if (existing) {
      existing.attempts.push({ ...entry, timestamp: ts });
      existing.totalAttempts++;
    } else {
      s.failureLog.push({
        workItem: entry.workItem,
        attempts: [{ ...entry, timestamp: ts }],
        totalAttempts: 1,
        escalatedTo: null,
        resolved: false,
      });
    }
    writeState(s);
    const total = existing ? existing.totalAttempts : 1;
    console.log(`Failure logged for '${entry.workItem}' (attempt ${total})`);
    break;
  }

  case 'tokens': {
    const s = readState();
    const log = s.performanceLog || [];

    if (log.length === 0) {
      console.log('\nNo token usage recorded yet.\n');
      break;
    }

    // Per-phase totals
    const byPhase = {};
    const byRole = {};
    let missionTotal = 0;

    for (const entry of log) {
      const tokens = entry.usage?.totalTokens || 0;
      const phase = entry.phase || 'unknown';
      const role = entry.role || 'unknown';
      const model = entry.model || '?';

      missionTotal += tokens;

      if (!byPhase[phase]) byPhase[phase] = { tokens: 0, count: 0, durationMs: 0 };
      byPhase[phase].tokens += tokens;
      byPhase[phase].count++;
      byPhase[phase].durationMs += entry.usage?.durationMs || 0;

      if (!byRole[role]) byRole[role] = { tokens: 0, count: 0, model, avgScore: 0, scores: [] };
      byRole[role].tokens += tokens;
      byRole[role].count++;
      if (entry.scores?.composite) byRole[role].scores.push(entry.scores.composite);
    }

    // Compute averages
    for (const role of Object.values(byRole)) {
      role.avgScore = role.scores.length > 0
        ? (role.scores.reduce((a, b) => a + b, 0) / role.scores.length).toFixed(1)
        : '—';
    }

    const fmt = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`;

    console.log(`\n## Token Usage Report\n`);
    console.log(`**Mission total:** ${fmt(missionTotal)} tokens across ${log.length} subagent runs\n`);

    console.log(`### By Phase\n`);
    console.log(`| Phase | Tokens | Runs | Avg/Run |`);
    console.log(`|---|---|---|---|`);
    for (const [phase, data] of Object.entries(byPhase).sort()) {
      const avg = data.count > 0 ? Math.round(data.tokens / data.count) : 0;
      console.log(`| ${phase} | ${fmt(data.tokens)} | ${data.count} | ${fmt(avg)} |`);
    }

    console.log(`\n### By Role\n`);
    console.log(`| Role | Model | Tokens | Runs | Avg/Run | Avg Score | Value |`);
    console.log(`|---|---|---|---|---|---|---|`);
    for (const [role, data] of Object.entries(byRole).sort()) {
      const avg = data.count > 0 ? Math.round(data.tokens / data.count) : 0;
      const score = data.avgScore;
      let value = '—';
      if (score !== '—') {
        const ratio = parseFloat(score) / (avg / 10000); // score per 10K tokens
        value = ratio > 1.5 ? 'great' : ratio > 0.8 ? 'ok' : 'poor';
      }
      console.log(`| ${role} | ${data.model} | ${fmt(data.tokens)} | ${data.count} | ${fmt(avg)} | ${score}/5 | ${value} |`);
    }

    console.log('');
    break;
  }

  case 'get': {
    const s = readState();
    const field = args[0];
    if (!field) die('Usage: mission-state.mjs get <field>');
    const parts = field.split('.');
    let val = s;
    for (const p of parts) val = val?.[p];
    console.log(typeof val === 'object' ? JSON.stringify(val, null, 2) : val);
    break;
  }

  case 'checkpoint-write': {
    const entry = JSON.parse(args[0] || '{}');
    if (!entry.workItem) die('checkpoint-write requires a workItem field');
    const checkpoint = {
      workItem: entry.workItem,
      phase: entry.phase || null,
      completedSteps: entry.completedSteps || [],
      remainingSteps: entry.remainingSteps || [],
      lastCommit: entry.lastCommit || null,
      filesChanged: entry.filesChanged || [],
      updatedAt: now(),
    };
    mkdirSync('.claude/missions', { recursive: true });
    writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
    console.log(`Checkpoint saved for '${checkpoint.workItem}' (${checkpoint.completedSteps.length} steps done, ${checkpoint.remainingSteps.length} remaining)`);
    break;
  }

  case 'checkpoint-read': {
    if (!existsSync(CHECKPOINT_FILE)) {
      console.log('null');
      process.exit(0);
    }
    try {
      const checkpoint = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf8'));
      console.log(JSON.stringify(checkpoint, null, 2));
    } catch {
      console.error('Checkpoint file is corrupted');
      process.exit(1);
    }
    break;
  }

  case 'checkpoint-clear': {
    if (existsSync(CHECKPOINT_FILE)) {
      unlinkSync(CHECKPOINT_FILE);
      console.log('Checkpoint cleared.');
    } else {
      console.log('No checkpoint to clear.');
    }
    break;
  }

  default:
    console.log(`Unknown command: ${cmd}`);
    console.log('Commands: status, phase-transition, pause, resume, log, score, score-batch, user-signal, rate-mission, lessons, lesson-add, lesson-remove, profile, failure, tokens, get, checkpoint-write, checkpoint-read, checkpoint-clear');
    process.exit(1);
}
