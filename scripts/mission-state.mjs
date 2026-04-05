#!/usr/bin/env node
// Mission state operations — atomic JSON read/write without LLM tokens
// Usage: node mission-state.mjs <command> [args]
// Zero dependencies

import { readFileSync, writeFileSync, existsSync } from 'fs';

const STATE_FILE = '.claude/missions/active-mission.json';

function die(msg) { console.error(`Error: ${msg}`); process.exit(1); }

function readState() {
  if (!existsSync(STATE_FILE)) die('No active mission (state file not found)');
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); }
  catch { die('State file is corrupted JSON. Run /mission reset.'); }
}

function writeState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
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

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) { console.log('Commands: status, phase-transition, pause, resume, log, score, failure, get'); process.exit(0); }

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
    const idx = s.phases.findIndex(p => p.status === 'active');
    if (idx === -1) die('No active phase found');
    const phase = s.phases[idx];
    phase.status = 'done';
    phase.completedAt = ts;

    if (idx + 1 < s.phases.length) {
      const next = s.phases[idx + 1];
      next.status = 'active';
      next.startedAt = ts;
      s.progressLog.push({ timestamp: ts, type: 'phase_complete', detail: `${phase.name} complete` });
      writeState(s);
      console.log(`Phase transition: ${phase.name} \u2192 ${next.name}`);
    } else {
      s.completedAt = ts;
      s.progressLog.push({ timestamp: ts, type: 'mission_complete', detail: `${phase.name} complete \u2014 mission finished` });
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
    s.performanceLog = s.performanceLog || [];
    entry.timestamp = now();
    s.performanceLog.push(entry);
    writeState(s);
    console.log(`Scored ${entry.agent}: ${entry.scores?.composite || '?'}/5`);
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

  default:
    console.log(`Unknown command: ${cmd}`);
    console.log('Commands: status, phase-transition, pause, resume, log, score, failure, get');
    process.exit(1);
}
