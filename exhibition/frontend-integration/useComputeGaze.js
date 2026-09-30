// This hook implements the exhibition team's existing engine interface.
// Eye detection, 3D fitting, calibration, and the primary filter remain on the Mac.
import { CAM_KEYS, VIEWER_BY_CAM, PERSON_LABEL, CAM_COLOR } from '../frontend-example/src/shared/gaze/participants';
import { OneEuroPoint } from './oneEuro';

const USER = { A: 1, B: 2 };
const refs = () => ({ A: { current: null }, B: { current: null } });
const diag = () => ({ state: 'idle', fps: 0, face: false, blinking: false, stale: true, hasModel: false, nx: 0, ny: 0, deviation: 0, invalid: 0 });
const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
import { pointFromPacket } from './coordinates.mjs';

async function api(key, resource, body, signal) {
  const response = await fetch(`/api/players/${USER[key]}/${resource}`, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }
    : { cache: 'no-store', signal });
  if (!response.ok) {
    const text = await response.text();
    let message = text; try { const data = JSON.parse(text); message = data.error || data.message || text; } catch {}
    throw new Error(message);
  }
  return response.json();
}
export function createComputeIntegration(React) {
const { createElement, useCallback, useEffect, useRef, useState } = React;
function useComputeGaze({ onSample, enabled = true } = {}) {
  const videoRefs = useRef(refs()).current;
  const canvasRefs = useRef(refs()).current;
  const gazeRef = useRef({ 'viewer-1': null, 'viewer-2': null });
  const diagRef = useRef({ A: diag(), B: diag() });
  const packets = useRef({});
  const callback = useRef(onSample); callback.current = onSample;
  const session = useRef(null);
  const abort = useRef(null);
  const images = useRef({});
  const filters = useRef({ A: new OneEuroPoint(), B: new OneEuroPoint() });
  const [status, setStatus] = useState('Mac compute server 연결 중');
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(enabled);
  const [deviceIds, setDeviceIds] = useState({ A: 'pi-1', B: 'pi-2' });
  const selected = useRef(deviceIds); selected.current = deviceIds;
  const [stats, setStats] = useState({ A: { fps: 0, face: false }, B: { fps: 0, face: false } });
  const [calibrated, setCalibrated] = useState([]);
  const [calibUi, setCalibUi] = useState(null);
  const [result, setResult] = useState(null);
  const [smoothing, setSmoothing] = useState({ minCutoff: 1.2, beta: .007 });
  useEffect(() => { CAM_KEYS.forEach(key => filters.current[key].setParams(smoothing)); }, [smoothing]);
  const paint = useCallback((key) => {
    const canvas = canvasRefs[key].current, image = images.current[key];
    if (!canvas || !image) return;
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
  }, [canvasRefs]);

  useEffect(() => {
    if (!enabled || !running) return undefined;
    let disposed = false;
    const sockets = [], timers = new Set(), controller = new AbortController();
    const schedule = (fn, ms) => { const timer = setTimeout(() => { timers.delete(timer); if (!disposed) fn(); }, ms); timers.add(timer); };
    const clear = (key) => { gazeRef.current[VIEWER_BY_CAM[key]] = null; filters.current[key].reset(); };
    const connect = (key) => {
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/gaze?user_id=${USER[key]}`);
      sockets.push(ws);
      ws.onmessage = ({ data }) => {
        let packet; try { packet = JSON.parse(data); } catch { return; }
        if (packet.type !== 'gaze' || packet.user_id !== USER[key]) return;
        packets.current[key] = packet;
        const previous = diagRef.current[key];
        if (previous.session !== packet.session_id) { clear(key); previous.session = packet.session_id; }
        const size = viewport();
        const point = selected.current[key] ? pointFromPacket(packet, size) : null;
        Object.assign(previous, { state: point ? 'tracking' : !packet.camera_connected ? 'no-camera' : !packet.calibrated ? 'no-model' : 'lost',
          face: packet.tracking, stale: packet.frame_age_ms == null || packet.frame_age_ms > 350,
          hasModel: packet.calibrated, nx: packet.x || 0, ny: packet.y || 0, received: performance.now() });
        if (point && !session.current) {
          const p = filters.current[key].filter(point.x, point.y, performance.now());
          gazeRef.current[VIEWER_BY_CAM[key]] = { ...p, at: Date.now(), frameAt: performance.now() };
          callback.current?.(VIEWER_BY_CAM[key], p.x, p.y);
        } else clear(key);
      };
      ws.onclose = () => { clear(key); diagRef.current[key].state = 'no-camera'; delete packets.current[key]; schedule(() => connect(key), 1000); };
      ws.onerror = () => ws.close();
    };
    const poll = async () => {
      const values = {};
      await Promise.all(CAM_KEYS.map(async key => {
        try {
          const p = await api(key, 'status', null, controller.signal);
          values[key] = { fps: p.processing_fps, face: p.pupil_detected };
          diagRef.current[key].fps = p.processing_fps;
        } catch { values[key] = { fps: 0, face: false }; }
        // Never keep an old cursor when frames or the socket disappear.
        if (performance.now() - (diagRef.current[key].received || 0) > 350) clear(key);
      }));
      if (disposed) return;
      setStats(values);
      setReady(Object.keys(packets.current).length > 0);
      setCalibrated(CAM_KEYS.filter(key => packets.current[key]?.calibrated && selected.current[key] && pointFromPacket({ ...packets.current[key], valid: true, x: 0, y: 0 }, viewport())));
      if (!session.current) setStatus(CAM_KEYS.map(key => `${PERSON_LABEL[key]}: ${values[key].face ? '동공 검출' : 'Pi 연결/눈 위치 확인'}`).join(' · '));
      schedule(poll, 200);
    };
    const preview = async (key) => {
      try {
        const response = await fetch(`/api/players/${USER[key]}/preview?overlay=1`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('no image');
        const blob = await response.blob(); const url = URL.createObjectURL(blob);
        const image = new Image();
        try { image.src = url; await image.decode(); if (!disposed) { images.current[key] = image; paint(key); } }
        finally { URL.revokeObjectURL(url); }
      } catch {
        delete images.current[key];
        const canvas = canvasRefs[key].current;
        if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      }
      // Only fetch previews on the operator/calibration screen; gaze remains live on every page.
      schedule(() => preview(key), canvasRefs[key].current || session.current ? 120 : 1000);
    };
    CAM_KEYS.forEach(key => { connect(key); preview(key); }); poll();
    const resize = () => { CAM_KEYS.forEach(clear); setCalibrated([]); setError('화면 크기가 바뀌었습니다. 같은 화면 크기로 다시 보정하세요.'); };
    window.addEventListener('resize', resize);
    return () => { disposed = true; controller.abort(); sockets.forEach(ws => ws.close()); timers.forEach(clearTimeout); CAM_KEYS.forEach(clear); window.removeEventListener('resize', resize); };
  }, [enabled, running, paint, canvasRefs]);

  const ui = useCallback((s, patch = {}) => ({ ready: false, point: null, index: 0, total: 12, phase: 'move', mode: s.mode,
    collectMs: 1000, personLabel: PERSON_LABEL[s.stages[s.stage]], color: CAM_COLOR[s.stages[s.stage]],
    stageIndex: s.stage, stageTotal: s.stages.length, ...patch }), []);
  const cancelCalibration = useCallback(async () => {
    const s = session.current; session.current = null; abort.current?.abort(); setCalibUi(null);
    if (s?.id) await api(s.stages[s.stage], 'calibration', { action: 'cancel', session_id: s.id }).catch(() => {});
  }, []);
  useEffect(() => () => { abort.current?.abort(); const s = session.current; if (s?.id) api(s.stages[s.stage], 'calibration', { action: 'cancel', session_id: s.id }).catch(() => {}); }, []);
  const beginCalibration = useCallback((mode = 'calibrate', only = null) => {
    if (session.current) return;
    const stages = CAM_KEYS.filter(key => (!only || key === only) && selected.current[key] && packets.current[key]?.camera_connected);
    if (!stages.length) { setError('Pi 영상 연결을 먼저 확인하세요.'); return; }
    const s = { stages, stage: 0, mode, rows: [], size: viewport() }; session.current = s;
    setError(null); setResult(null); setCalibUi(ui(s));
    setStatus(mode === 'validate' ? 'Mac 서버의 9점 보정과 독립 3점 검증을 다시 진행합니다.' : '착용 후 정면을 보세요. 눈을 여러 방향으로 움직여 모델을 준비하세요.');
  }, [ui]);
  const startStage = useCallback(async () => {
    const s = session.current; if (!s || s.busy) return; s.busy = true;
    const key = s.stages[s.stage];
    const controller = new AbortController(); abort.current = controller;
    const call = (body) => api(key, 'calibration', body, controller.signal);
    const wait = (ms) => new Promise((resolve, reject) => {
      const done = () => { controller.signal.removeEventListener('abort', cancel); resolve(); };
      const timer = setTimeout(done, ms);
      const cancel = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
      controller.signal.addEventListener('abort', cancel, { once: true });
    });
    try {
      if (s.size.width !== window.innerWidth || s.size.height !== window.innerHeight) throw new Error('보정 중 화면 크기를 바꾸지 마세요. 취소 후 다시 시작하세요.');
      if (!s.id) {
        const p = await api(key, 'status', null, controller.signal);
        if (!p.ready) throw new Error('동공이 보이도록 착용을 조정하고 눈을 위·아래·좌·우로 움직인 뒤 다시 시작하세요.');
        if (p.tracker_details?.engine === 'pupil') {
          setCalibUi(ui(s, { ready: true, point: { x: .5, y: .5 }, phase: 'collect' }));
          setStatus('정면의 중앙 점을 보세요.');
          await wait(1200);
          await call({ action: 'neutral' });
        }
        const start = await call({ action: 'begin', viewport: s.size }); s.id = start.session_id;
        s.plan = await api(key, 'plan', null, controller.signal); s.index = 0;
      }
      const points = [...s.plan.points, ...s.plan.validation_points];
      for (; s.index < points.length; s.index++) {
        if (session.current !== s) return;
        if (s.size.width !== window.innerWidth || s.size.height !== window.innerHeight) throw new Error('화면 크기가 바뀌었습니다. 취소 후 다시 시작하세요.');
        const point = { x: points[s.index][0], y: points[s.index][1] };
        setCalibUi(ui(s, { ready: true, point, index: s.index, total: points.length, phase: 'move', mode: s.index < 9 ? 'calibrate' : 'validate' }));
        await wait(750);
        setCalibUi(ui(s, { ready: true, point, index: s.index, total: points.length, phase: 'collect', mode: s.index < 9 ? 'calibrate' : 'validate' }));
        const response = await call({ action: s.index < 9 ? 'sample' : 'validate', session_id: s.id,
          ...(s.index < 9 ? { index: s.index } : { validation_index: s.index - 9 }) });
        if (response.calibrated) s.rows.push({ key, cam: key, value: response.validation_error * Math.hypot(s.size.width, s.size.height), max: response.validation_error * Math.hypot(s.size.width, s.size.height), covered: 3, total: 3 });
      }
      s.stage++; s.id = null;
      if (s.stage < s.stages.length) { setCalibUi(ui(s)); setStatus('다음 참가자가 정면을 보고 준비한 뒤 시작하세요.'); }
      else { setResult({ kind: 'validation', rows: s.rows }); setCalibUi(null); session.current = null; setStatus('보정과 독립 3점 검증 완료 · 참여 시작을 누르세요.'); }
      setError(null);
    } catch (err) {
      if (err.name !== 'AbortError' && session.current === s) {
        if (err.message.includes('세션이 만료')) { s.id = null; s.index = 0; }
        setError(err.message); setCalibUi(ui(s));
      }
    } finally { s.busy = false; }
  }, [ui]);
  const resetCalibration = useCallback(async () => {
    try {
      await cancelCalibration(); await Promise.all(CAM_KEYS.map(key => api(key, 'calibration', { action: 'reset' })));
      setCalibrated([]); setResult(null); setError(null);
    } catch (err) { setError(err.message); }
  }, [cancelCalibration]);
  return { status, error, ready, running, devices: [{ deviceId: 'pi-1', label: 'Pi 1P 눈 카메라' }, { deviceId: 'pi-2', label: 'Pi 2P 눈 카메라' }],
    deviceIds, setDeviceId: (key, id) => { if (id && id !== `pi-${USER[key]}`) { setError('A는 1P, B는 2P Pi에 연결됩니다.'); return; } setDeviceIds(value => ({ ...value, [key]: id })); },
    refreshDevices: () => {}, startCameras: () => { setRunning(true); setError(null); }, stopAll: () => { cancelCalibration(); setRunning(false); },
    videoRefs, canvasRefs, streams: { A: null, B: null }, stats, setShowLandmarks: () => {},
    calibUi, calibrated, result, gridCount: 9, setGridCount: () => setStatus('Mac 보정은 9점 + 독립 3점 검증을 사용합니다.'),
    smoothing, setSmoothing, beginCalibration, startStage, cancelCalibration, resetCalibration, isCalibrating: Boolean(calibUi), gazeRef, diagRef };
}

// Small integration overlay; all exhibition scene/layout components stay team-owned.
function ComputeCalibrationFeed({ engine }) {
  const canvas = useRef(null);
  useEffect(() => {
    if (!engine.calibUi) return undefined;
    let cancelled = false, timer;
    const key = CAM_KEYS[engine.calibUi.stageIndex] || 'A';
    const keyByLabel = CAM_KEYS.find(k => PERSON_LABEL[k] === engine.calibUi.personLabel) || key;
    const show = async () => {
      let url;
      try {
        const response = await fetch(`/api/players/${USER[keyByLabel]}/preview?overlay=1`, { cache: 'no-store' });
        if (!response.ok) throw new Error('No camera');
        url = URL.createObjectURL(await response.blob());
        const image = new Image(); image.src = url; await image.decode();
        if (!cancelled && canvas.current) { const c = canvas.current; c.width = image.naturalWidth; c.height = image.naturalHeight; c.getContext('2d').drawImage(image, 0, 0); }
      } catch { if (canvas.current) canvas.current.getContext('2d').clearRect(0, 0, canvas.current.width, canvas.current.height); }
      finally { if (url) URL.revokeObjectURL(url); if (!cancelled) timer = setTimeout(show, 120); }
    };
    show(); return () => { cancelled = true; clearTimeout(timer); };
  }, [engine.calibUi?.personLabel]);
  if (!engine.calibUi) return null;
  return createElement('aside', { style: { position: 'fixed', right: 12, bottom: 12, zIndex: 10000, width: 220, padding: 8, borderRadius: 8, background: '#112219', color: 'white', fontSize: 12, pointerEvents: 'none' } },
    createElement('canvas', { ref: canvas, style: { width: '100%', aspectRatio: '4 / 3' } }),
    createElement('div', null, `${engine.calibUi.personLabel} · Pi 눈 카메라`),
    createElement('div', null, engine.error || '착용을 조정하고 정면을 보세요. 점을 눈으로 따라가세요.'));
}

return { useComputeGaze, ComputeCalibrationFeed };
}
