import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useEntryFlow } from '../EntryFlowContext';
import { useMobileLink } from '../mobileLink/MobileLinkContext';
import { PRESENCE, evaluateFaces } from './presence';
import { subscribePresence } from './presenceCamera';
import { trackedPlayers } from '../piSensors/presence.mjs';

const PI_GAZE = process.env.NEXT_PUBLIC_GAZE_SOURCE === 'pi';

/**
 * 체험 흐름(/1~/5)에서 사람이 떠났거나 바뀌었으면 /pre_opening 으로 되돌린다.
 * - idleMs 동안 아무 활동이 없으면 돌아간다.
 * - newUserGapMs 넘게 비어 있다가 누군가 정면으로 들어오면, 새 사용자로 보고 돌아간다.
 *   얼굴로 같은 사람인지 알 수 없으므로 "자리가 비었다가 다시 찼는지"로 세션 경계를 긋는다.
 *   그보다 짧게 비었다 돌아오면(잠깐 자리 비움, 한 명만 바뀜) 같은 세션으로 이어 간다.
 * 활동: 카메라 앞에 arriveMs 이상 머문 얼굴, 시선 응시 진행, 마우스·터치·키 입력, 페이지 이동, 휴대폰 연동 메시지.
 * 짧게 스쳐 가는 사람(arriveMs 미만)은 활동으로 치지 않는다.
 *
 * 판정 상태를 보려면 주소에 ?idleDebug=1 을 붙인다(브라우저에 기억됨). ?idleDebug=0 으로 끈다.
 */
export const IDLE_RESET = {
  pages: ['/1', '/2', '/3', '/fail', '/4', '/5'],
  home: '/pre_opening',
  idleMs: 30 * 1000,
  newUserGapMs: 20 * 1000,
  arriveMs: 2000,
  faceGraceMs: 800,
};

// 입장 센서는 넉넉하게 받지만, 여기서 그 기준을 쓰면 뒤에 서 있는 사람 때문에 복귀가 영영 안 선다.
const FACE_CONFIG = { ...PRESENCE, minFaceWidth: 0.07, minRelativeWidth: 0.5 };

const INPUT_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
// 마우스가 가만히 있어도 화면 아래 내용이 바뀌면 Chrome 이 pointermove 를 보낸다.
// 숨긴 커서가 화면 가운데 머무는 키오스크에서는 그게 계속 '활동'이 되므로 실제로 움직였을 때만 친다.
const POINTER_MOVE_PX = 8;
const DEBUG_KEY = 'seoul-idle-debug';

const DEBUG_STYLE = {
  position: 'fixed',
  right: 16,
  bottom: 16,
  zIndex: 9999,
  padding: '10px 14px',
  borderRadius: 8,
  background: 'rgba(0, 0, 0, 0.72)',
  color: '#fff',
  font: '13px/1.5 monospace',
  whiteSpace: 'pre',
  pointerEvents: 'none',
};

function seconds(ms) {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

export default function FlowIdleGuard() {
  const router = useRouter();
  const { resetFlow, dwellProgress, diagRef } = useEntryFlow();
  const { disconnect, status: linkStatus, slots, slotPlants } = useMobileLink();
  const active = IDLE_RESET.pages.includes(router.pathname);

  const stateRef = useRef({
    lastActiveAt: 0,
    faceSince: 0,
    lastNearAt: 0,
    gapBefore: 0,
    fired: false,
    // 디버그 표시용
    camera: 'idle',
    lastFrameAt: 0,
    near: 0,
    ok: 0,
    lastFire: '',
    lastReason: '',
  });

  const [debug, setDebug] = useState(false);
  const [debugText, setDebugText] = useState('');

  const resetRef = useRef(null);
  resetRef.current = (reason) => {
    stateRef.current.lastFire = `${reason} @ ${new Date().toLocaleTimeString()}`;
    resetFlow();
    disconnect();
    router.replace(IDLE_RESET.home);
  };

  // 공백(gapBefore)은 얼굴이 나타난 순간 한 번 재고 여기서는 건드리지 않는다.
  // 돌아온 사람이 화면을 보며 만드는 시선 응시·입력이 "같은 세션" 증거가 되어 버리면 안 되기 때문이다.
  const markActive = useCallback((reason) => {
    stateRef.current.lastActiveAt = performance.now();
    stateRef.current.lastReason = typeof reason === 'string' ? reason : reason?.type || '입력';
  }, []);

  useEffect(() => {
    markActive('페이지 이동');
  }, [router.asPath, markActive]);

  useEffect(() => {
    if (dwellProgress > 0) markActive('시선 응시');
  }, [dwellProgress, markActive]);

  // /4 에서 휴대폰으로 이름을 쓰는 동안은 고개를 숙여 얼굴이 안 잡힐 수 있다.
  // 연결이 끊겨 1초마다 재접속하면 상태와 slots 객체가 계속 새로 바뀌므로, 휴대폰 쪽 내용이 달라졌을 때만 친다.
  const paired = linkStatus === 'paired';
  const slotA = Boolean(slots?.A);
  const slotB = Boolean(slots?.B);
  useEffect(() => {
    markActive('휴대폰');
  }, [paired, slotA, slotB, slotPlants, markActive]);

  useEffect(() => {
    if (!router.isReady) return;
    const flag = router.query.idleDebug;
    try {
      if (flag === '1') window.localStorage.setItem(DEBUG_KEY, '1');
      if (flag === '0') window.localStorage.removeItem(DEBUG_KEY);
      setDebug(window.localStorage.getItem(DEBUG_KEY) === '1');
    } catch {
      setDebug(flag === '1');
    }
  }, [router.isReady, router.query.idleDebug]);

  useEffect(() => {
    if (!debug) return undefined;
    const timer = window.setInterval(() => {
      const state = stateRef.current;
      const now = performance.now();
      const faceAge = state.faceSince ? now - state.faceSince : 0;
      const sinceActive = now - state.lastActiveAt;
      const frameAge = state.lastFrameAt ? now - state.lastFrameAt : Infinity;
      const camera = state.camera === 'watching' && frameAge > 2000 ? `프레임 끊김 ${seconds(frameAge)}` : state.camera;
      setDebugText([
        `감시 ${active ? router.pathname : '꺼짐 (' + router.pathname + ')'} · 카메라 ${camera}`,
        `얼굴 가까이 ${state.near} · 정면 ${state.ok} · 머문 지 ${seconds(faceAge)} (기준 ${seconds(IDLE_RESET.arriveMs)})`,
        `마지막 활동 ${seconds(sinceActive)} 전 · ${state.lastReason || '-'} (복귀 ${seconds(IDLE_RESET.idleMs)})`,
        `얼굴 등장 전 공백 ${seconds(state.gapBefore)} (새 세션 기준 ${seconds(IDLE_RESET.newUserGapMs)})`,
        state.lastFire ? `마지막 복귀: ${state.lastFire}` : '마지막 복귀: 없음',
      ].join('\n'));
    }, 250);
    return () => window.clearInterval(timer);
  }, [debug, active, router.pathname]);

  useEffect(() => {
    if (!active) return undefined;

    const state = stateRef.current;
    Object.assign(state, {
      lastActiveAt: performance.now(),
      faceSince: 0,
      lastNearAt: 0,
      gapBefore: 0,
      fired: false,
    });

    const fire = (reason) => {
      if (state.fired) return;
      state.fired = true;
      resetRef.current(reason);
    };

    INPUT_EVENTS.forEach((type) => window.addEventListener(type, markActive, { passive: true }));

    let pointerX = null;
    let pointerY = null;
    const onPointerMove = (event) => {
      if (pointerX !== null && Math.hypot(event.clientX - pointerX, event.clientY - pointerY) < POINTER_MOVE_PX) {
        return;
      }
      const first = pointerX === null;
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!first) markActive('마우스 이동');
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const idleTimer = window.setInterval(() => {
      if (performance.now() - state.lastActiveAt >= IDLE_RESET.idleMs) fire('무활동');
    }, 1000);

    const observe = ({ status, result, now, piFaces }) => {
      if (status) state.camera = status;
      if (!result && !piFaces) return;
      state.lastFrameAt = now;
      const faces = piFaces || evaluateFaces(result, FACE_CONFIG).faces;
      const near = faces.some((face) => face.near);
      state.near = faces.filter((face) => face.near).length;
      state.ok = faces.filter((face) => face.ok).length;

      if (!near) {
        if (state.faceSince && now - state.lastNearAt > IDLE_RESET.faceGraceMs) {
          state.faceSince = 0;
          state.gapBefore = 0;
        }
        return;
      }

      if (!state.faceSince) {
        state.faceSince = now;
        state.gapBefore = now - state.lastActiveAt;
      }
      state.lastNearAt = now;
      if (now - state.faceSince < IDLE_RESET.arriveMs) return;

      if (state.gapBefore < IDLE_RESET.newUserGapMs) {
        state.lastActiveAt = now;
        state.lastReason = '얼굴';
      } else if (faces.some((face) => face.ok)) {
        fire(`새 사용자 (공백 ${seconds(state.gapBefore)})`);
      }
    };
    let unsubscribe;
    if (PI_GAZE) {
      const timer = setInterval(() => {
        const now = performance.now();
        observe({ status: 'Pi 눈 카메라', now, piFaces: trackedPlayers(diagRef.current, now).map(() => ({ near: true, ok: true })) });
      }, 100);
      unsubscribe = () => clearInterval(timer);
    } else {
      unsubscribe = subscribePresence(observe);
    }

    return () => {
      INPUT_EVENTS.forEach((type) => window.removeEventListener(type, markActive));
      window.removeEventListener('pointermove', onPointerMove);
      window.clearInterval(idleTimer);
      unsubscribe();
    };
  }, [active, markActive, diagRef]);

  if (!debug) return null;
  return <div style={DEBUG_STYLE}>{debugText}</div>;
}
