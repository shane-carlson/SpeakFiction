const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const win = process.env.SF_WIN === '1' || process.argv.includes('--win');
const intel = !win && (process.env.SF_MAC_ARCH === 'x64' || process.argv.includes('--intel'));
const binDir = path.join(root, 'models', win ? 'bin-win-x64' : intel ? 'bin-x64' : 'bin');
const cli = path.join(binDir, win ? 'whisper-cli.exe' : 'whisper-cli');

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runAllowFail(command, args) {
  return spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env },
  });
}

if (win) {
  if (!fs.existsSync(cli) || fs.statSync(cli).size < 10_000) {
    console.log('Windows whisper-cli.exe not found; trying official CPU build…');
    runAllowFail(process.execPath, [path.join(root, 'scripts', 'fetch-whisper-win.cjs')]);
  }
  if (!fs.existsSync(cli) || fs.statSync(cli).size < 10_000) {
    console.warn('Packing Windows without native whisper.cpp (WASM fallback).');
  } else {
    console.log(`Using ${path.relative(root, cli)}`);
  }
  const tiny = path.join(root, 'models', 'ggml-tiny.en.bin');
  if (!fs.existsSync(tiny) || fs.statSync(tiny).size < 10_000_000) {
    console.log('Fetching ggml-tiny.en for low-memory Windows machines…');
    runAllowFail(process.execPath, [path.join(root, 'scripts', 'fetch-ggml-tiny.cjs')]);
  }
  if (fs.existsSync(tiny) && fs.statSync(tiny).size > 10_000_000) {
    console.log(`Using ${path.relative(root, tiny)}`);
  } else {
    console.warn('Packing Windows without bundled tiny.en (first dictate will download it).');
  }
  run(process.execPath, [path.join(root, 'scripts', 'make-ico.cjs')]);
  console.log('Packaging prerequisites ready (Windows x64).');
  process.exit(0);
}

if (!fs.existsSync(cli) || fs.statSync(cli).size < 10_000) {
  const hint = intel
    ? 'ARCH=x86_64 bash scripts/build-whisper-cli.sh'
    : 'bash scripts/build-whisper-cli.sh';
  console.error(`Missing ${path.relative(root, cli)}. Build it first:\n  ${hint}`);
  process.exit(1);
}

if (intel) {
  const info = spawnSync('/usr/bin/file', [cli], { encoding: 'utf8' });
  if (info.status === 0 && !/x86_64/.test(info.stdout || '')) {
    console.error(`${cli} is not an Intel (x86_64) binary:\n${info.stdout}`);
    process.exit(1);
  }
}

run(process.execPath, [path.join(root, 'scripts', 'make-icns.cjs')]);

console.log(`Packaging prerequisites ready (${intel ? 'Intel x64' : 'Apple Silicon arm64'}).`);
