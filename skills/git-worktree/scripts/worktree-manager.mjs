#!/usr/bin/env node
// Worktree manager — create isolated git worktrees with auto-detected dependency install
// Usage: node worktree-manager.mjs <cmd> [args]
// Zero dependencies

import { existsSync, readdirSync, copyFileSync, renameSync, writeFileSync, readFileSync, appendFileSync } from 'fs';
import { execSync, spawnSync } from 'child_process';
import path from 'path';

function die(msg) { console.error(`Error: ${msg}`); process.exit(1); }
function warn(msg) { process.stderr.write(`\nWarning: ${msg}\n`); }

function gitRoot() {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (result.status !== 0) die('Not inside a git repository.');
  return result.stdout.trim();
}

function isDirtyTree(root) {
  const result = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
  return (result.stdout || '').trim().length > 0;
}

function ensureWorktreesIgnored(root) {
  const gitignore = path.join(root, '.gitignore');
  const line = '.worktrees/';
  if (existsSync(gitignore)) {
    const content = readFileSync(gitignore, 'utf8');
    if (content.split('\n').some(l => l.trim() === line)) return;
    appendFileSync(gitignore, content.endsWith('\n') ? line + '\n' : '\n' + line + '\n');
  } else {
    writeFileSync(gitignore, line + '\n');
  }
  console.log(`Added '${line}' to .gitignore`);
}

function validateBranch(branch) {
  if (branch.split('/').some(seg => seg === '..')) {
    die(`Branch name '${branch}' contains '..' — path traversal rejected.`);
  }
}

function copyEnvFiles(sourceRoot, destRoot) {
  let copied = 0;
  const entries = readdirSync(sourceRoot).filter(f => f.startsWith('.env'));
  for (const f of entries) {
    if (f === '.env.example') continue;
    const src = path.join(sourceRoot, f);
    const dst = path.join(destRoot, f);
    if (existsSync(dst)) renameSync(dst, dst + '.backup');
    copyFileSync(src, dst);
    copied++;
  }
  if (copied > 0) console.log(`Copied ${copied} .env file(s) to worktree.`);
}

function runProjectSetup(worktreePath, sourceRoot) {
  copyEnvFiles(sourceRoot, worktreePath);

  const has = (f) => existsSync(path.join(worktreePath, f));
  const run = (cmd, args) => {
    console.log(`\nRunning: ${cmd} ${args.join(' ')}`);
    const r = spawnSync(cmd, args, { cwd: worktreePath, stdio: 'inherit', timeout: 600_000 });
    if (r.status !== 0) {
      warn(`Installer exited ${r.status}. To retry manually:\n  cd ${worktreePath} && ${cmd} ${args.join(' ')}`);
    }
  };

  if (has('package.json')) {
    if (has('bun.lockb'))            run('bun', ['install']);
    else if (has('pnpm-lock.yaml'))  run('pnpm', ['install', '--frozen-lockfile']);
    else if (has('yarn.lock'))       run('yarn', ['install', '--frozen-lockfile']);
    else if (has('package-lock.json')) run('npm', ['ci']);
    else                             run('npm', ['install']);
    return;
  }
  if (has('Gemfile')) { run('bundle', ['install']); return; }
  if (has('pyproject.toml') || has('requirements.txt')) {
    if (has('uv.lock'))             run('uv', ['sync']);
    else if (has('poetry.lock'))    run('poetry', ['install']);
    else if (has('Pipfile.lock'))   run('pipenv', ['install']);
    else if (has('requirements.txt')) run('pip', ['install', '-r', 'requirements.txt']);
    else                            run('pip', ['install', '-e', '.']);
    return;
  }
  if (has('go.mod'))    { run('go', ['mod', 'download']); return; }
  if (has('Cargo.toml')) { run('cargo', ['fetch']); return; }

  console.log('No manifest detected, skipping install.');
}

const [cmd, ...args] = process.argv.slice(2);

if (!cmd || cmd === 'help') {
  console.log('Usage: worktree-manager.mjs <command> [args]');
  console.log('Commands:');
  console.log('  create <branch> [--from <base>] [--no-setup]  Create worktree with optional env/dep setup');
  console.log('  list | ls                                      List all worktrees');
  console.log('  cleanup | clean                                Interactively remove worktrees');
  console.log('  setup [path]                                   Re-run setup on an existing worktree');
  console.log('  help                                           Show this message');
  process.exit(0);
}

switch (cmd) {
  case 'create': {
    const branch = args[0];
    if (!branch) die('Usage: create <branch> [--from <base>] [--no-setup]');
    validateBranch(branch);

    const fromIdx = args.indexOf('--from');
    const base = fromIdx !== -1 ? args[fromIdx + 1] : 'HEAD';
    const noSetup = args.includes('--no-setup');

    const root = gitRoot();
    const worktreePath = path.join(root, '.worktrees', ...branch.split('/'));

    if (isDirtyTree(root)) {
      warn('Working tree has uncommitted changes. Worktree will branch from the current HEAD state.');
    }

    ensureWorktreesIgnored(root);

    if (existsSync(worktreePath)) {
      console.log(`Worktree already exists at ${worktreePath} — skipping create.`);
    } else {
      // Try to add with new branch first; fall back to existing branch
      const addResult = spawnSync(
        'git', ['worktree', 'add', '-b', branch, worktreePath, base],
        { cwd: root, encoding: 'utf8', stdio: 'pipe' }
      );
      if (addResult.status !== 0) {
        // Branch may already exist — try without -b
        const addExisting = spawnSync(
          'git', ['worktree', 'add', worktreePath, branch],
          { cwd: root, encoding: 'utf8', stdio: 'inherit' }
        );
        if (addExisting.status !== 0) die(`git worktree add failed. Stderr: ${addResult.stderr}`);
      } else {
        process.stdout.write(addResult.stdout);
      }
      console.log(`Worktree created: ${worktreePath}`);
    }

    if (!noSetup) runProjectSetup(worktreePath, root);

    // Trailing JSON line — always last stdout line for caller parsing
    console.log(JSON.stringify({ worktreePath, branch }));
    break;
  }

  case 'list':
  case 'ls': {
    const result = spawnSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8' });
    if (result.status !== 0) die('git worktree list failed');
    const blocks = result.stdout.trim().split('\n\n');
    console.log('\nWorktrees:\n');
    for (const block of blocks) {
      const lines = Object.fromEntries(block.split('\n').map(l => l.split(' ', 2)));
      const wt = lines['worktree'] || '?';
      const branch = lines['branch']?.replace('refs/heads/', '') || lines['HEAD'] || '(detached)';
      const isCurrent = wt === process.cwd();
      console.log(`  ${isCurrent ? '* ' : '  '}${branch.padEnd(40)} ${wt}`);
    }
    console.log('');
    break;
  }

  case 'cleanup':
  case 'clean': {
    const root = gitRoot();
    const wtBase = path.join(root, '.worktrees');
    if (!existsSync(wtBase)) { console.log('No .worktrees/ directory found.'); break; }

    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise(res => rl.question(q, res));

    const entries = readdirSync(wtBase, { withFileTypes: true }).filter(e => e.isDirectory());
    if (entries.length === 0) { console.log('No worktrees to clean up.'); rl.close(); break; }

    let removed = 0;
    for (const entry of entries) {
      const wtPath = path.join(wtBase, entry.name);
      if (wtPath === process.cwd()) { console.log(`Skipping current worktree: ${wtPath}`); continue; }
      const ans = await ask(`Remove worktree '${entry.name}' at ${wtPath}? [y/N] `);
      if (ans.trim().toLowerCase() === 'y') {
        const r = spawnSync('git', ['worktree', 'remove', wtPath], { cwd: root, encoding: 'utf8', stdio: 'inherit' });
        if (r.status === 0) { console.log(`Removed: ${wtPath}`); removed++; }
        else warn(`Could not remove ${wtPath}. Remove manually with: git worktree remove ${wtPath}`);
      }
    }
    rl.close();
    console.log(`\nDone. Removed ${removed} worktree(s).`);
    break;
  }

  case 'setup': {
    const target = args[0] ? path.resolve(args[0]) : process.cwd();
    const root = gitRoot();
    if (!existsSync(target)) die(`Path does not exist: ${target}`);
    console.log(`Running setup in: ${target}`);
    runProjectSetup(target, root);
    break;
  }

  default:
    die(`Unknown command: ${cmd}. Run 'help' for usage.`);
}
