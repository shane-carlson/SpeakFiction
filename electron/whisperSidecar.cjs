const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { modelsDir, cliPath, serverPath, modelPath, getProfile, nativeCliReady, modelReady, demoteNativeProfile, cpuAfterCudaFailure } = require('./hardware.cjs');
const { usesGpuRuntime } = require('./paths.cjs');
const { ensureGgmlModel, ensureModelsDir, cacheMatch, cachePut } = require('./modelCache.cjs');
const { ensureCudaCli } = require('./cudaSidecar.cjs');
const { blockCuda } = require('./nvidia.cjs');

const LITERARY_PROMPT =
  'Literary fiction narration in clear English prose. Complete sentences. No timestamps.';
const SERVER_PORT = 38471;

let serverProc = null;
let idleTimer = null;
let loadedModel = '';
let startingPromise = null;

function writeWav16k(file, float32) {
  const n = float32.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(16000, 24);
  buf.writeUInt32LE(16000 * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    buf.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

function resampleTo16k(input, fromRate) {
  if (fromRate === 16000 || input.length === 0) return input;
  const ratio = fromRate / 16000;
  const outLength = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const x = i * ratio;
    const i0 = Math.min(Math.floor(x), input.length - 1);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = x - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

function samplesFromPayload(payload) {
  const raw = payload?.samples ?? payload?.pcm;
  if (!raw) return new Float32Array(0);
  if (raw instanceof Float32Array) return raw;
  if (Buffer.isBuffer(raw)) {
    return new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
  }
  if (Array.isArray(raw) || ArrayBuffer.isView(raw)) return Float32Array.from(raw);
  if (typeof raw === 'object' && raw.length) return Float32Array.from(Array.from({ length: raw.length }, (_, i) => raw[i]));
  return new Float32Array(0);
}

function binDir(profile) {
  return path.dirname(cliPath(profile?.runtime));
}

function isEnglishOnlyModel(modelId) {
  return /\.en(?:\.bin)?$/i.test(String(modelId || ''));
}

function spawnOpts(profile) {
  const lib = binDir(profile);
  const env = { ...process.env };
  if (process.platform === 'darwin') {
    env.DYLD_LIBRARY_PATH = [lib, process.env.DYLD_LIBRARY_PATH].filter(Boolean).join(':');
  } else if (process.platform === 'win32') {
    env.PATH = [lib, process.env.PATH].filter(Boolean).join(';');
  } else {
    env.LD_LIBRARY_PATH = [lib, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  }
  return {
    cwd: lib,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  };
}

function runCli(args, profile) {
  return new Promise((resolve, reject) => {
    const child = spawn(cliPath(profile?.runtime), args, spawnOpts(profile));
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.stderr.on('data', (d) => {
      err += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0 && !out.trim()) {
        reject(new Error(err.trim() || `whisper-cli exited ${code}`));
        return;
      }
      resolve(out.trim());
    });
  });
}

function parseTranscript(stdout) {
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.replace(/^\[[^\]]+\]\s*/, '').trim())
    .filter(
      (l) =>
        l &&
        !l.startsWith('whisper_') &&
        !l.startsWith('ggml_') &&
        !l.startsWith('system_info') &&
        !l.startsWith('main:'),
    );
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

function nativeArgs(profile, wav, prompt) {
  const model = modelPath(profile.modelId);
  const hint = String(prompt || LITERARY_PROMPT).slice(0, 400);
  const args = [
    '-m',
    model,
    '-f',
    wav,
    '-nt',
    '-np',
    '-t',
    String(profile.threads),
    '-bs',
    String(profile.beamSize || 1),
    '--temperature',
    '0',
    '--temperature-inc',
    '0',
    // Higher = keep more speech (whisper.cpp skips when no_speech_prob > thold).
    '--no-speech-thold',
    '0.75',
    '--max-context',
    '0',
    '--prompt',
    hint,
  ];
  if (!isEnglishOnlyModel(profile.modelId)) args.push('-l', 'en');
  if (!usesGpuRuntime(profile.runtime)) args.push('--no-gpu');
  return args;
}

function stopServer() {
  if (!serverProc) return;
  try {
    serverProc.kill();
  } catch {
    /* ignore */
  }
  serverProc = null;
  loadedModel = '';
}

function scheduleUnload(profile) {
  if (idleTimer) clearTimeout(idleTimer);
  if (!profile.idleUnloadMs || profile.keepResident) return;
  idleTimer = setTimeout(() => stopServer(), profile.idleUnloadMs);
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function waitForServer(timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const sock = net.connect(SERVER_PORT, '127.0.0.1', () => {
        sock.end();
        resolve();
      });
      sock.on('error', () => {
        sock.destroy();
        if (Date.now() - started > timeoutMs) reject(new Error('whisper-server failed to start'));
        else setTimeout(tick, 250);
      });
    };
    tick();
  });
}

async function ensureServer(profile) {
  if (serverProc && loadedModel === profile.modelId) return true;
  if (startingPromise) return startingPromise;
  if (!fs.existsSync(serverPath())) return false;
  startingPromise = (async () => {
    stopServer();
    const model = modelPath(profile.modelId);
    const args = [
      '-m',
      model,
      '-t',
      String(profile.threads),
      '--port',
      String(SERVER_PORT),
      '--host',
      '127.0.0.1',
      '--prompt',
      String(profile.prompt || LITERARY_PROMPT).slice(0, 400),
    ];
    if (!isEnglishOnlyModel(profile.modelId)) args.push('-l', 'en');
    if (!usesGpuRuntime(profile.runtime)) args.push('--no-gpu');
    serverProc = spawn(serverPath(profile.runtime), args, spawnOpts(profile));
    serverProc.on('exit', () => {
      if (serverProc) {
        serverProc = null;
        loadedModel = '';
      }
    });
    await waitForServer();
    loadedModel = profile.modelId;
    return true;
  })().finally(() => {
    startingPromise = null;
  });
  return startingPromise;
}

function postInference(wav, profile) {
  return new Promise((resolve, reject) => {
    const boundary = `----sf${Date.now()}`;
    const fileBuf = fs.readFileSync(wav);
    const chunks = [
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="utt.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
      fileBuf,
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="temperature"\r\n\r\n0\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="temperature_inc"\r\n\r\n0\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="no_speech_thold"\r\n\r\n0.75\r\n`, // higher = keep more speech
      `--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nen\r\n`,
      `--${boundary}--\r\n`,
    ];
    const body = Buffer.concat(chunks.map((c) => (typeof c === 'string' ? Buffer.from(c) : c)));
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: SERVER_PORT,
        path: '/inference',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (d) => {
          data += d.toString();
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(String(json.text || json.transcription || '').trim());
          } catch {
            resolve(parseTranscript(data));
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
    void profile;
  });
}

function pcmRms(pcm) {
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / Math.max(1, pcm.length));
}

/** Aligned with MIN_DECODE_RMS in speechUtterance.ts. Near-digital-silence only. */
const MIN_PCM_RMS = 0.003;

async function decodeWithProfile(profile, wav, prompt) {
  if (profile.keepResident && serverProc && loadedModel === profile.modelId) {
    try {
      return await withTimeout(postInference(wav, profile), 20000, 'whisper-server');
    } catch {
      stopServer();
    }
  }
  const stdout = await withTimeout(runCli(nativeArgs(profile, wav, prompt), profile), 90000, 'whisper-cli');
  return parseTranscript(stdout);
}

async function transcribeNative(payload, profile) {
  const sampleRate = payload?.sampleRate || 16000;
  const pcm = resampleTo16k(samplesFromPayload(payload), sampleRate);
  if (pcm.length < 16000 * 0.12) return '';
  if (pcmRms(pcm) < MIN_PCM_RMS) return '';
  const wav = path.join(os.tmpdir(), `sf-whisper-${process.pid}-${Date.now()}.wav`);
  writeWav16k(wav, pcm);
  let current = profile;
  let lastErr;
  try {
    for (let i = 0; i < 5; i++) {
      try {
        const text = await decodeWithProfile(current, wav, payload?.prompt);
        scheduleUnload(current);
        return text;
      } catch (err) {
        lastErr = err;
        stopServer();
        if (String(current.runtime || '').includes('cuda')) {
          console.warn('CUDA whisper failed, using a smaller CPU model', err);
          blockCuda();
          current = cpuAfterCudaFailure(current);
          continue;
        }
        const next = demoteNativeProfile(current);
        if (!next) break;
        console.warn(`Native whisper failed on ${current.modelId}, trying ${next.modelId}`, err);
        current = next;
      }
    }
    throw lastErr || new Error('whisper-cli failed');
  } finally {
    try {
      fs.unlinkSync(wav);
    } catch {
      /* ignore */
    }
  }
}

function nativeAvailable() {
  return nativeCliReady();
}

async function ensureNativeProfile(profile, onProgress) {
  if (profile.runtime === 'whisper.cpp-cuda') {
    const scale = modelReady(profile.modelId) ? 1 : 0.45;
    await ensureCudaCli((percent) => onProgress?.(Math.round(percent * scale)));
  }
  if (profile.runtime === 'wasm') return profile;
  if (!modelReady(profile.modelId)) {
    const offset = profile.runtime === 'whisper.cpp-cuda' ? 45 : 0;
    const span = 100 - offset;
    await ensureGgmlModel(profile.modelId, (percent) =>
      onProgress?.(offset + Math.round((percent * span) / 100)),
    );
  }
  if (profile.keepResident) {
    ensureServer(profile).catch(() => stopServer());
  }
  return profile;
}

async function ensureStt(onProgress) {
  ensureModelsDir();
  let profile = getProfile();
  const seen = new Set();
  let lastErr;
  for (let i = 0; i < 5; i++) {
    const key = `${profile.runtime}:${profile.modelId}`;
    if (seen.has(key)) break;
    seen.add(key);
    try {
      profile = await ensureNativeProfile(profile, onProgress);
      onProgress?.(100);
      return profile;
    } catch (err) {
      lastErr = err;
      console.warn('STT ensure failed, trying a smaller model', err);
      if (String(profile.runtime || '').includes('cuda')) {
        blockCuda();
        stopServer();
        profile = cpuAfterCudaFailure(profile);
        continue;
      }
      const next = demoteNativeProfile(profile);
      if (!next) break;
      profile = next;
    }
  }
  throw lastErr || new Error('Could not load the on-device speech model.');
}

module.exports = {
  getProfile,
  transcribeNative,
  nativeAvailable,
  cliPath,
  modelsDir,
  ensureStt,
  cacheMatch,
  cachePut,
  stopServer,
  isEnglishOnlyModel,
  nativeArgs,
};
