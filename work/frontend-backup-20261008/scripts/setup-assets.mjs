import fs from 'node:fs';
import path from 'node:path';

// MediaPipe wasm 과 얼굴 랜드마크 모델을 public/ 으로 옮긴다.
// 자산은 용량이 커서 저장소에 넣지 않고(.gitignore) 설치할 때마다 준비한다.
// 준비에 실패하면 런타임이 CDN 으로 폴백하므로 설치를 막지는 않는다.

const root = process.cwd();
const wasmSrc = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmDest = path.join(root, 'public', 'mediapipe', 'wasm');
const modelDest = path.join(root, 'public', 'mediapipe', 'face_landmarker.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

function copyWasm() {
  if (!fs.existsSync(wasmSrc)) {
    console.warn('[setup-assets] tasks-vision wasm 폴더를 찾지 못했습니다. CDN 으로 폴백합니다.');
    return false;
  }

  fs.mkdirSync(path.dirname(wasmDest), { recursive: true });
  fs.rmSync(wasmDest, { recursive: true, force: true });
  fs.cpSync(wasmSrc, wasmDest, { recursive: true });
  console.log('[setup-assets] wasm 복사 완료 ->', path.relative(root, wasmDest));
  return true;
}

async function downloadModel() {
  if (fs.existsSync(modelDest) && fs.statSync(modelDest).size > 1_000_000) {
    console.log('[setup-assets] 모델이 이미 존재합니다.');
    return true;
  }

  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(modelDest), { recursive: true });
    fs.writeFileSync(modelDest, buf);
    console.log('[setup-assets] 모델 다운로드 완료', (buf.length / 1e6).toFixed(1), 'MB');
    return true;
  } catch (err) {
    console.warn(
      '[setup-assets] 모델 다운로드 실패:',
      err.message,
      '- 런타임에 CDN 으로 폴백합니다.'
    );
    return false;
  }
}

copyWasm();
await downloadModel();
