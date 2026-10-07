import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

const LOCAL_WASM = '/mediapipe/wasm';
const LOCAL_MODEL = '/mediapipe/face_landmarker.task';
// CDN 폴백 버전은 package.json 의 @mediapipe/tasks-vision 버전과 맞춰야 한다.
// wasm 과 JS 래퍼 버전이 다르면 로딩이 깨진다.
const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

async function head(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

/** 로컬 public/mediapipe 자산을 우선 쓰고, 없으면 CDN 으로 폴백한다. */
export async function createFaceLandmarker(
  onProgress = () => {},
  { numFaces = 1, detection = 0.5, presence = 0.5, tracking = 0.5 } = {}
) {
  onProgress('wasm 로딩 중…');
  const wasmPath = (await head(`${LOCAL_WASM}/vision_wasm_internal.js`)) ? LOCAL_WASM : CDN_WASM;
  const fileset = await FilesetResolver.forVisionTasks(wasmPath);

  onProgress('모델 로딩 중…');
  const modelAssetPath = (await head(LOCAL_MODEL)) ? LOCAL_MODEL : CDN_MODEL;

  const options = (delegate) => ({
    baseOptions: { modelAssetPath, delegate },
    runningMode: 'VIDEO',
    numFaces,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: true,
    minFaceDetectionConfidence: detection,
    minFacePresenceConfidence: presence,
    minTrackingConfidence: tracking,
  });

  try {
    return await FaceLandmarker.createFromOptions(fileset, options('GPU'));
  } catch (err) {
    onProgress('GPU 실패 → CPU 폴백');
    return FaceLandmarker.createFromOptions(fileset, options('CPU'));
  }
}
