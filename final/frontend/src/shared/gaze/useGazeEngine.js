import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CAM_COLOR, CAM_KEYS, PERSON_LABEL, VIEWER_BY_CAM } from './participants';
import { createFaceLandmarker } from './faceLandmarker';
import { extractFeatures, gazeVector, LM } from './features';
import { featureDeviation, fitRidgeRobust, predictRidge } from './ridge';
import { OneEuroPoint } from './oneEuro';
import {
  advanceStage,
  beginStage,
  createSession,
  currentCam,
  isIntro,
  step as stepSession,
} from './calibrationSession';
import { clearGazeSession, loadGazeSession, saveGazeSession } from './gazeSession';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const MOVE_MS = 800;
const COLLECT_MS = 1300;
// collect 시작 직후 ~200ms 는 눈이 아직 안착 중이라 샘플을 버린다. 실질 수집 구간은
// [SETTLE_MS, COLLECT_MS] 로, 더 깨끗한 고정(fixation) 샘플만 회귀 학습에 들어간다.
const SETTLE_MS = 200;
const MIN_SAMPLES = 8;

// 특징이 19차원인데 보정 타깃은 9~16개뿐이라, 약하게 걸면 2차·교차항이 학습 점만
// 통과하고 그 바깥에서 발산한다. 표준화 기준이라 이 값이 곧 신호 대비 패널티 비율.
const RIDGE_LAMBDA = 0.3;

// 두 카메라의 프레임레이트가 다를 수 있어 특징의 신선도를 이 범위로 제한한다.
const STALE_MS = 150;

// 깜빡임은 보통 100~300ms 다. 그 사이 커서를 숨기면 계속 사라지는 것처럼 보이므로
// 마지막 좌표를 이 시간까지 유지한다.
const GAZE_HOLD_MS = 700;

const ONE_EURO = { minCutoff: 0.9, beta: 0.008 };
const CAMERA_HEIGHT = 720;

const GRIDS = {
  // 상단 안내 뱃지와 타깃이 겹치지 않도록 첫 행에 충분한 여백을 둔다.
  9: { xs: [0.08, 0.5, 0.92], ys: [0.22, 0.5, 0.9] },
  16: { xs: [0.07, 0.36, 0.64, 0.93], ys: [0.22, 0.36, 0.64, 0.92] },
};

const VALIDATION_POINTS = [
  { x: 0.2, y: 0.22 },
  { x: 0.8, y: 0.22 },
  { x: 0.5, y: 0.5 },
  { x: 0.2, y: 0.8 },
  { x: 0.8, y: 0.8 },
];

function gridPoints(count) {
  const { xs, ys } = GRIDS[count] ?? GRIDS[9];
  const points = [];

  ys.forEach((y, row) => {
    const line = row % 2 === 0 ? xs : [...xs].reverse(); // 지그재그로 이동 거리 최소화
    line.forEach((x) => points.push({ x, y }));
  });

  return points;
}

function describeError(err) {
  // OverconstrainedError 처럼 message 가 비는 경우가 있어 name/constraint 를 함께 보여준다.
  const parts = [err.name || 'Error'];
  if (err.constraint) parts.push(`(${err.constraint})`);
  if (err.message) parts.push(err.message);
  return parts.join(' ');
}

function makeDiag() {
  return {
    state: 'idle',
    fps: 0,
    face: false,
    blinking: false,
    stale: false,
    hasModel: false,
    invalid: 0,
    nx: 0,
    ny: 0,
    deviation: 0,
  };
}

function makeCam() {
  return {
    landmarker: null,
    stream: null,
    lastVideoTime: -1,
    last: { f: null, t: 0, blinking: false },
    openBase: 0,
    fps: { frames: 0, last: 0, value: 0 },
  };
}

/**
 * 웹캠 두 대로 두 사람의 시선을 동시에 추적하는 엔진.
 *
 * MediaPipe FaceLandmarker 로 홍채와 머리 자세를 뽑고, 보정 때 모은 샘플로 릿지 회귀를
 * 학습해 화면 좌표로 매핑한다. 카메라마다 별도의 랜드마커와 모델을 두므로 사람마다
 * 따로 보정할 수 있다.
 *
 * 시선 좌표는 매 프레임 `gazeRef` 에 직접 써넣는다. 초당 60번 setState 하면 화면 전체가
 * 다시 그려지므로, 좌표를 읽어야 하는 쪽이 자기 루프에서 ref 를 읽어가게 한다.
 *
 * @param {(viewerId: string, x: number, y: number) => void} [onSample]
 * @param {boolean} [enabled] — false면 모델·카메라 초기화 생략 (예: /mobile)
 */
export function useGazeEngine({ onSample, enabled = true } = {}) {
  const videoRefs = useRef({ A: { current: null }, B: { current: null } }).current;
  const canvasRefs = useRef({ A: { current: null }, B: { current: null } }).current;

  const camsRef = useRef({ A: makeCam(), B: makeCam() });
  const modelsRef = useRef({});
  const resumedRef = useRef(false);
  const filtersRef = useRef({
    A: new OneEuroPoint(ONE_EURO),
    B: new OneEuroPoint(ONE_EURO),
  });
  const gazeRef = useRef({ [VIEWER_BY_CAM.A]: null, [VIEWER_BY_CAM.B]: null });

  // 커서가 왜 끊기는지 눈으로 확인하기 위한 진단값. 매 프레임 갱신되므로 state 가 아니라 ref.
  const diagRef = useRef({
    A: makeDiag(),
    B: makeDiag(),
  });

  const rafRef = useRef(null);
  const startingRef = useRef(false);
  const calibRef = useRef(null);
  const statsTickRef = useRef(0);
  const onSampleRef = useRef(onSample);
  const gridCountRef = useRef(9);
  const showLandmarksRef = useRef(true);

  onSampleRef.current = onSample;

  const [status, setStatus] = useState(enabled ? '모델 로딩 대기 중' : '시선 추적 사용 안 함');
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [devices, setDevices] = useState([]);
  const [deviceIds, setDeviceIds] = useState({ A: '', B: '' });
  // 보정 화면 미리보기가 같은 스트림을 자기 비디오에 붙일 수 있도록 내보낸다.
  const [streams, setStreams] = useState({ A: null, B: null });
  const [calibUi, setCalibUi] = useState(null);
  const [calibrated, setCalibrated] = useState([]);
  // 특징이 19차원이라 9점은 과적합에 취약하다. 정확도가 부족하면 16점으로 올린다.
  const [gridCount, setGridCount] = useState(9);
  // minCutoff 를 낮추면 가만히 볼 때 더 안정되고, beta 를 낮추면 빠른 이동에서도 덜 튄다.
  const [smoothing, setSmoothing] = useState(ONE_EURO);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState({ A: { fps: 0, face: false }, B: { fps: 0, face: false } });

  gridCountRef.current = gridCount;

  const persistModels = useCallback(() => {
    saveGazeSession({ models: modelsRef.current });
  }, []);

  // 페이지를 나갔다 들어와도 같은 탭의 보정 모델을 다시 쓴다.
  useIsoLayoutEffect(() => {
    const session = loadGazeSession();
    if (!session?.models) return;
    modelsRef.current = session.models;
    setCalibrated(Object.keys(session.models));
    if (session.deviceIds) setDeviceIds(session.deviceIds);
  }, []);

  useEffect(() => {
    CAM_KEYS.forEach((key) => filtersRef.current[key].setParams(smoothing));
  }, [smoothing]);

  // ── 모델 로딩 ────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      setReady(false);
      setError(null);
      setStatus('시선 추적 사용 안 함');
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        const landmarker = await createFaceLandmarker((msg) => !cancelled && setStatus(msg));
        if (cancelled) {
          landmarker.close();
          return;
        }

        camsRef.current.A.landmarker = landmarker;
        setReady(true);
        setStatus('준비 완료 · 카메라를 시작하세요');
      } catch (err) {
        setError(`모델 로딩 실패: ${err.message}`);
        setStatus(`모델 로딩 실패: ${err.message}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      CAM_KEYS.forEach((key) => {
        camsRef.current[key].stream?.getTracks().forEach((track) => track.stop());
        camsRef.current[key].landmarker?.close();
      });
    },
    []
  );

  const refreshDevices = useCallback(async () => {
    if (!enabled || !navigator.mediaDevices?.enumerateDevices) {
      setDevices([]);
      return;
    }
    const list = await navigator.mediaDevices.enumerateDevices();
    const cameras = list.filter((device) => device.kind === 'videoinput');
    setDevices(cameras);
    setDeviceIds((current) => {
      const availableIds = new Set(cameras.map((device) => device.deviceId));
      const first = availableIds.has(current.A) ? current.A : cameras[0]?.deviceId || '';
      const second =
        current.B && current.B !== first && availableIds.has(current.B)
          ? current.B
          : cameras.find((device) => device.deviceId !== first)?.deviceId || '';
      if (first === current.A && second === current.B) return current;
      return { A: first, B: second };
    });
    return cameras;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    refreshDevices();
  }, [enabled, refreshDevices]);

  const setDeviceId = useCallback((key, id) => {
    setDeviceIds((current) => ({ ...current, [key]: id }));
  }, []);

  // ── 미리보기 위 랜드마크 오버레이 ────────────────────────────
  const drawLandmarks = useCallback((canvas, lm) => {
    if (!canvas) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (!lm || !showLandmarksRef.current) return;

    const px = (i) => ({ x: lm[i].x * w, y: lm[i].y * h });
    const mean = (indices) => {
      const pts = indices.map(px);
      return {
        x: pts.reduce((a, p) => a + p.x, 0) / pts.length,
        y: pts.reduce((a, p) => a + p.y, 0) / pts.length,
      };
    };

    ctx.lineWidth = 1.5;
    for (const eye of [LM.left, LM.right]) {
      // 특징 추출에 실제로 쓰는 눈꺼풀 3점 + 눈꼬리를 그대로 이어 그린다.
      ctx.strokeStyle = '#4caf6d';
      for (const lid of [eye.upper, eye.lower]) {
        const pts = [eye.outer, ...lid, eye.inner].map(px);
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
      }

      const ring = eye.ring.map(px);
      const c = mean([eye.iris, ...eye.ring]);
      const r = ring.reduce((a, p) => a + Math.hypot(p.x - c.x, p.y - c.y), 0) / ring.length;

      ctx.strokeStyle = '#e08a3c';
      ctx.beginPath();
      ctx.arc(c.x, c.y, Math.max(r, 3), 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#e08a3c';
      ctx.fillRect(c.x - 2, c.y - 2, 4, 4);
    }
  }, []);

  // ── 단계(사람) 단위 학습·검증 ────────────────────────────────
  const trainStage = useCallback((cam, samples) => {
    if (samples.length < MIN_SAMPLES * 3) return [];

    const W = window.innerWidth;
    const H = window.innerHeight;
    const X = samples.map((s) => s.v);
    const Y = samples.map((s) => [s.target.x, s.target.y]);
    const fit = fitRidgeRobust(X, Y, RIDGE_LAMBDA);

    let sum = 0;
    fit.X.forEach((x, i) => {
      const p = predictRidge(fit.model, x);
      sum += ((p[0] - fit.Y[i][0]) * W) ** 2 + ((p[1] - fit.Y[i][1]) * H) ** 2;
    });

    modelsRef.current[cam] = fit.model;
    filtersRef.current[cam].reset();
    saveGazeSession({ models: modelsRef.current });

    return [{ key: cam, cam, value: Math.sqrt(sum / fit.X.length), samples: fit.X.length }];
  }, []);

  const validateStage = useCallback((cam, samples, points) => {
    const model = modelsRef.current[cam];
    if (!model || !samples.length) return [];

    const W = window.innerWidth;
    const H = window.innerHeight;
    const errors = points
      .map((pt, i) => {
        const group = samples.filter((s) => s.pointIndex === i);
        if (group.length < 3) return null;

        const avg = group.reduce(
          (acc, s) => {
            const p = predictRidge(model, s.v);
            return { x: acc.x + p[0] / group.length, y: acc.y + p[1] / group.length };
          },
          { x: 0, y: 0 }
        );

        return Math.hypot((avg.x - pt.x) * W, (avg.y - pt.y) * H);
      })
      .filter((e) => e !== null);

    if (!errors.length) return [];

    return [
      {
        key: cam,
        cam,
        value: errors.reduce((a, b) => a + b, 0) / errors.length,
        max: Math.max(...errors),
        covered: errors.length,
        total: points.length,
      },
    ];
  }, []);

  const uiFor = useCallback((session) => {
    const cam = currentCam(session);
    return {
      ready: !isIntro(session),
      mode: session.mode,
      cam,
      personLabel: PERSON_LABEL[cam],
      color: CAM_COLOR[cam],
      stageIndex: session.stageIdx,
      stageTotal: session.stages.length,
      index: session.idx,
      total: session.points.length,
      phase: session.phase,
      point: session.points[session.idx],
      summary: session.summary,
      collectMs: COLLECT_MS,
    };
  }, []);

  const finishSession = useCallback((session) => {
    calibRef.current = null;
    setCalibUi(null);

    if (!session.rows.length) {
      setStatus('샘플이 부족합니다 · 조명과 얼굴 위치를 확인한 뒤 다시 시도하세요');
      return;
    }

    if (session.mode === 'calibrate') {
      const diagonal = Math.hypot(window.innerWidth, window.innerHeight);
      setCalibrated(Object.keys(modelsRef.current));
      setResult({
        kind: 'train',
        rows: session.rows,
        poor: session.rows.every((r) => r.value > diagonal * 0.1),
      });
      setStatus('보정 완료');
      return;
    }

    setResult({ kind: 'validate', rows: session.rows });
    setStatus('정확도 측정 완료');
  }, []);

  const finishStage = useCallback(() => {
    const session = calibRef.current;
    if (!session) return;

    const cam = currentCam(session);
    const rows =
      session.mode === 'calibrate'
        ? trainStage(cam, session.samples[cam])
        : validateStage(cam, session.samples[cam], session.points);
    session.rows.push(...rows);

    if (!advanceStage(session)) {
      finishSession(session);
      return;
    }

    // 다음 사람이 자리를 잡을 수 있도록 대기 화면으로 돌아간다.
    session.summary = { personLabel: PERSON_LABEL[cam], rows };
    setCalibUi(uiFor(session));
    setStatus(`${PERSON_LABEL[cam]} 완료 · 다음 단계 대기 중`);
  }, [finishSession, trainStage, uiFor, validateStage]);

  const stepCalibration = useCallback(
    (fresh, updated, now) => {
      const session = calibRef.current;
      if (!session || isIntro(session)) return;

      const cam = currentCam(session);
      const f = fresh[cam];

      // 화면 주사율이 카메라보다 빠르면 같은 프레임이 반복 수집되므로 새 프레임일 때만 쌓는다.
      const { event, sampleIndex } = stepSession(session, now, Boolean(updated[cam] && f));

      if (sampleIndex >= 0 && f) {
        session.samples[cam].push({
          v: gazeVector(f),
          target: session.points[sampleIndex],
          pointIndex: sampleIndex,
        });
      }

      if (event === 'stage-done') finishStage();
      else if (event === 'move-end' || event === 'next-point') setCalibUi(uiFor(session));
    },
    [finishStage, uiFor]
  );

  // ── 메인 루프: 한 프레임에서 두 카메라를 모두 처리한다 ────────
  const tick = useCallback(() => {
    rafRef.current = requestAnimationFrame(tick);
    const now = performance.now();

    const updated = { A: false, B: false };
    CAM_KEYS.forEach((key) => {
      const cam = camsRef.current[key];
      const video = videoRefs[key].current;
      if (!cam.stream || !cam.landmarker || !video) return;
      if (video.paused) video.play().catch(() => {});
      if (video.readyState < 2 || !video.videoWidth) return;
      if (video.currentTime === cam.lastVideoTime) return;

      cam.lastVideoTime = video.currentTime;
      updated[key] = true;

      let res;
      try {
        res = cam.landmarker.detectForVideo(video, now);
      } catch {
        return;
      }

      const lm = res.faceLandmarks?.[0];
      const f = lm
        ? extractFeatures(
            lm,
            res.facialTransformationMatrixes?.[0]?.data,
            video.videoWidth / video.videoHeight
          )
        : null;

      if (f) {
        // 눈 크기는 사람·거리·카메라마다 달라서 최근 최대 개안 정도를 기준으로 판정한다.
        cam.openBase = cam.openBase === 0 ? f.openness : Math.max(f.openness, cam.openBase * 0.997);
        cam.last = { f, t: now, blinking: f.openness < Math.max(0.1, cam.openBase * 0.55) };
      } else {
        cam.last = { f: null, t: now, blinking: false };
      }

      drawLandmarks(canvasRefs[key].current, lm);

      cam.fps.frames += 1;
      if (now - cam.fps.last > 500) {
        cam.fps.value = (cam.fps.frames * 1000) / (now - cam.fps.last);
        cam.fps.frames = 0;
        cam.fps.last = now;
      }
    });

    const fresh = {};
    CAM_KEYS.forEach((key) => {
      const { last, stream } = camsRef.current[key];
      fresh[key] = stream && last.f && now - last.t < STALE_MS && !last.blinking ? last.f : null;
    });

    if (calibRef.current) stepCalibration(fresh, updated, now);

    const calibrating = Boolean(calibRef.current);
    const pointerOwnsGaze = typeof window !== 'undefined' && window.__seoulPointerOwnsGaze > now;
    CAM_KEYS.forEach((key) => {
      if (pointerOwnsGaze) return;
      const viewerId = VIEWER_BY_CAM[key];
      const model = modelsRef.current[key];
      const cam = camsRef.current[key];
      const diag = diagRef.current[key];
      const f = fresh[key];

      diag.fps = cam.fps.value;
      diag.face = Boolean(cam.last.f);
      diag.blinking = cam.last.blinking;
      diag.stale = Boolean(cam.last.f) && now - cam.last.t >= STALE_MS;
      diag.hasModel = Boolean(model);

      if (calibrating || !model || !cam.stream) {
        gazeRef.current[viewerId] = null;
        diag.state = calibrating ? 'calibrating' : !cam.stream ? 'no-camera' : 'no-model';
        return;
      }

      if (!f) {
        // 깜빡임이나 한두 프레임 검출 실패로 커서를 바로 숨기면, 눈을 깜빡일 때마다 사라진다.
        // 마지막 좌표를 잠시 유지하고, 그보다 오래 끊길 때만 숨긴다.
        const held = gazeRef.current[viewerId];
        if (!held) {
          diag.state = 'lost';
          return;
        }
        if (now - held.frameAt > GAZE_HOLD_MS) {
          gazeRef.current[viewerId] = null;
          diag.state = 'lost';
        } else {
          diag.state = 'holding';
        }
        return;
      }

      const v = gazeVector(f);
      const [nx, ny] = predictRidge(model, v);
      diag.deviation = featureDeviation(model, v);

      // 보정이 부실하면 회귀 가중치가 발산해 NaN/Infinity 가 나온다. 그대로 쓰면 커서가
      // 화면에서 사라지는데 원인을 알 수 없으므로, 따로 세어 진단에 드러낸다.
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
        diag.invalid += 1;
        diag.state = 'invalid-model';
        return;
      }

      const x = Math.min(Math.max(nx, -0.05), 1.05) * window.innerWidth;
      const y = Math.min(Math.max(ny, -0.05), 1.05) * window.innerHeight;
      const s = filtersRef.current[key].filter(x, y, now);

      diag.nx = nx;
      diag.ny = ny;
      diag.state = 'tracking';

      gazeRef.current[viewerId] = { x: s.x, y: s.y, at: Date.now(), frameAt: now };
      onSampleRef.current?.(viewerId, s.x, s.y);
    });

    if (now - statsTickRef.current > 300) {
      statsTickRef.current = now;
      setStats({
        A: { fps: camsRef.current.A.fps.value, face: Boolean(fresh.A) },
        B: { fps: camsRef.current.B.fps.value, face: Boolean(fresh.B) },
      });
    }
    // videoRefs/canvasRefs 는 렌더마다 같은 객체라 의존성에서 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawLandmarks, stepCalibration]);

  // ── 카메라 제어 ──────────────────────────────────────────────
  const stopCamera = useCallback(
    (key) => {
      const cam = camsRef.current[key];
      cam.stream?.getTracks().forEach((track) => track.stop());
      cam.stream = null;
      cam.lastVideoTime = -1;
      cam.openBase = 0;
      cam.last = { f: null, t: 0, blinking: false };
      cam.fps = { frames: 0, last: 0, value: 0 };
      gazeRef.current[VIEWER_BY_CAM[key]] = null;
      setStreams((current) => (current[key] ? { ...current, [key]: null } : current));

      const video = videoRefs[key].current;
      if (video) video.srcObject = null;
    },
    [videoRefs]
  );

  const startCameras = useCallback(async () => {
    if (!enabled) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('이 환경에서는 카메라 API를 사용할 수 없습니다 (HTTPS·권한 확인)');
      return;
    }
    if (startingRef.current) return; // 재시작 요청이 겹치면 같은 장치를 두 번 열게 된다
    if (deviceIds.B && deviceIds.B === deviceIds.A) {
      setStatus('1번과 2번 참가자에게 서로 다른 카메라를 지정하세요');
      return;
    }

    startingRef.current = true;
    const errors = [];

    try {
      for (const key of CAM_KEYS) {
        stopCamera(key);
        const id = deviceIds[key];

        try {
          setStatus(`${PERSON_LABEL[key]} 카메라 요청 중…`);
          const stream =
            key === 'B' && !id && camsRef.current.A.stream
              ? camsRef.current.A.stream.clone()
              : await navigator.mediaDevices.getUserMedia({
                  video: {
                    deviceId: id ? { exact: id } : undefined,
                    width: { ideal: Math.round((CAMERA_HEIGHT * 16) / 9) },
                    height: { ideal: CAMERA_HEIGHT },
                    frameRate: { ideal: 30 },
                  },
                  audio: false,
                });

          const cam = camsRef.current[key];
          cam.stream = stream;
          const video = videoRefs[key].current;
          video.srcObject = stream;
          await video.play();
          setStreams((current) => ({ ...current, [key]: stream }));
          cam.fps.last = performance.now();

          if (!cam.landmarker) {
            setStatus(`${PERSON_LABEL[key]} 모델 준비 중…`);
            cam.landmarker = await createFaceLandmarker();
          }
        } catch (err) {
          stopCamera(key);
          errors.push(`${PERSON_LABEL[key]}: ${describeError(err)}`);
        }
      }
    } finally {
      startingRef.current = false;
    }

    await refreshDevices();
    const live = CAM_KEYS.filter((key) => camsRef.current[key].stream);
    setRunning(live.length > 0);

    if (!live.length) {
      setStatus(`카메라 오류 · ${errors.join(' / ')}`);
      return;
    }

    setStatus(
      `카메라 ${live.length}대 동작 중${errors.length ? ` · 실패 ${errors.join(' / ')}` : ''}`
    );
    saveGazeSession({ running: true, deviceIds });

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, [deviceIds, enabled, refreshDevices, stopCamera, tick, videoRefs]);

  // 권한을 허용한 뒤에야 장치 목록이 채워지므로, 동작 중에 카메라를 바꾸면 바로 다시 연다.
  useEffect(() => {
    if (!running) return;
    startCameras();
    // startCameras 는 deviceIds 가 바뀔 때마다 새로 만들어지므로 선택값만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceIds]);

  // 새로고침이나 페이지 재진입으로 엔진이 다시 떠도, 이미 보정이 있으면 카메라를 다시 연다.
  useEffect(() => {
    if (!ready || resumedRef.current) return undefined;
    const session = loadGazeSession();
    const hasModel = session?.models && Object.keys(session.models).length > 0;
    if (!session?.running || !hasModel) return undefined;
    resumedRef.current = true;
    startCameras();
    return undefined;
  }, [ready, startCameras]);

  const stopAll = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    CAM_KEYS.forEach(stopCamera);
    calibRef.current = null;
    setCalibUi(null);
    setRunning(false);
    saveGazeSession({ running: false });
    setStatus('카메라 정지');
  }, [stopCamera]);

  // ── 보정 세션 ────────────────────────────────────────────────
  const beginCalibration = useCallback(
    (mode = 'calibrate', only = null) => {
      if (!running) {
        setStatus('먼저 카메라를 시작하세요');
        return;
      }

      const stages = CAM_KEYS.filter((key) => {
        if (only && key !== only) return false;
        if (!camsRef.current[key].stream) return false;
        if (mode === 'validate') return Boolean(modelsRef.current[key]);
        return true;
      });

      if (!stages.length) {
        setStatus(mode === 'validate' ? '먼저 보정을 진행하세요' : '사용할 카메라가 없습니다');
        return;
      }

      const session = createSession({
        mode,
        stages,
        points: mode === 'validate' ? VALIDATION_POINTS : gridPoints(gridCountRef.current),
        moveMs: MOVE_MS,
        collectMs: COLLECT_MS,
        settleMs: SETTLE_MS,
        minSamples: MIN_SAMPLES,
      });
      session.samples = { A: [], B: [] };
      session.rows = [];
      session.summary = null;

      calibRef.current = session;
      setResult(null);

      if (mode === 'calibrate') {
        // 이번에 다시 찍는 사람의 모델만 버린다 (한 명만 재보정 가능)
        stages.forEach((cam) => delete modelsRef.current[cam]);
        setCalibrated(Object.keys(modelsRef.current));
        persistModels();
      }

      setCalibUi(uiFor(session));
      setStatus(mode === 'validate' ? '정확도 측정 대기 중' : '보정 대기 중');
    },
    [persistModels, running, uiFor]
  );

  const startStage = useCallback(() => {
    const session = calibRef.current;
    if (!session || !isIntro(session)) return;

    beginStage(session, performance.now());
    session.summary = null;
    setCalibUi(uiFor(session));
    setStatus(`${PERSON_LABEL[currentCam(session)]} 보정 진행 중`);
  }, [uiFor]);

  const cancelCalibration = useCallback(() => {
    calibRef.current = null;
    setCalibUi(null);
    // 중간에 끊어도 이미 학습된 단계는 살아 있으므로 UI 상태를 맞춰준다.
    setCalibrated(Object.keys(modelsRef.current));
    setStatus('보정 중단됨');
  }, []);

  const resetCalibration = useCallback(() => {
    modelsRef.current = {};
    CAM_KEYS.forEach((key) => {
      filtersRef.current[key].reset();
      gazeRef.current[VIEWER_BY_CAM[key]] = null;
    });
    setCalibrated([]);
    setResult(null);
    clearGazeSession();
    setStatus('보정 초기화됨');
  }, []);

  const setShowLandmarks = useCallback((show) => {
    showLandmarksRef.current = Boolean(show);
  }, []);

  return {
    // 준비 상태
    status,
    ready,
    error,
    running,

    // 카메라
    devices,
    deviceIds,
    setDeviceId,
    refreshDevices,
    startCameras,
    stopAll,
    videoRefs,
    canvasRefs,
    streams,
    stats,
    setShowLandmarks,

    // 보정
    calibUi,
    calibrated,
    result,
    gridCount,
    setGridCount,
    smoothing,
    setSmoothing,
    beginCalibration,
    startStage,
    cancelCalibration,
    resetCalibration,
    isCalibrating: Boolean(calibUi),

    // 시선 (렌더를 유발하지 않도록 ref 로 전달)
    gazeRef,
    diagRef,
  };
}
