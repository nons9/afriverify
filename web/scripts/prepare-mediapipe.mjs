// Self-hosts the MediaPipe runtime + face model under /public/mediapipe so the live
// face scan never depends on a third-party CDN at runtime (privacy + availability).
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'mediapipe');
mkdirSync(out, { recursive: true });

const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
if (existsSync(wasmSrc)) cpSync(wasmSrc, join(out, 'wasm'), { recursive: true });
else console.warn('[mediapipe] @mediapipe/tasks-vision not installed; skipping wasm copy');

const modelPath = join(out, 'face_landmarker.task');
if (!existsSync(modelPath)) {
  const url = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(modelPath, Buffer.from(await res.arrayBuffer()));
    console.log('[mediapipe] downloaded face_landmarker.task');
  } catch (e) {
    // Not fatal: the capture UI degrades to timed prompts and the server still judges every frame.
    console.warn('[mediapipe] could not download face model:', e.message);
  }
}
