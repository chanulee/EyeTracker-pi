import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './Ending.module.css';

const DEFAULT_FADE = 800;
// 멘트 경계(speechStops, 영상 초)에 이만큼 앞서 멈춰 기다린다. timeupdate 간격(~0.25초)보다 길어야 한다.
const STOP_LOOKAHEAD_S = 0.35;
// 말이 끝났는지 다시 확인하는 간격.
const WAIT_POLL_MS = 100;

// waitRef.current() 가 true 인 동안은 "아직 말하는 중"이라 멘트 경계·영상 끝에서 멈춰 기다린다.
function stillSpeaking(waitRef) {
  return Boolean(waitRef?.current?.());
}

function fadeOf(shot) {
  return shot && shot.fade > 0 ? shot.fade : DEFAULT_FADE;
}

export function rateForShot(shot, time) {
  if (!shot || !(shot.slowUntil > 0)) return 1;
  const from = shot.slowFrom > 0 ? shot.slowFrom : 0;
  if (time >= from && time < shot.slowUntil) return shot.slowRate || 0.25;
  return 1;
}

function syncRate(video, shot) {
  if (!video || video.tagName !== 'VIDEO') return;
  const rate = rateForShot(shot, video.currentTime);
  if (video.playbackRate !== rate) video.playbackRate = rate;
}

function whenReady(el) {
  if (!el) return Promise.resolve();
  if (el.tagName !== 'VIDEO') {
    if (el.complete) return Promise.resolve();
    return new Promise((resolve) => {
      el.addEventListener('load', () => resolve(), { once: true });
      window.setTimeout(resolve, 400);
    });
  }
  if (el.readyState >= 2) return Promise.resolve();
  return new Promise((resolve) => {
    el.addEventListener('loadeddata', () => resolve(), { once: true });
    window.setTimeout(resolve, 700);
  });
}

function layerOf(el) {
  return el && el.parentElement;
}

function holdOpaque(layer, z) {
  if (!layer) return;
  layer.style.transition = 'none';
  layer.style.opacity = '1';
  layer.style.zIndex = String(z);
}

function hideLayer(layer) {
  if (!layer) return;
  layer.style.transition = 'none';
  layer.style.opacity = '0';
  layer.style.zIndex = '0';
}

function fadeLayerIn(incomingEl, outgoingEl, ms, done) {
  const start = performance.now();
  const tick = (now) => {
    holdOpaque(layerOf(outgoingEl), 1);
    const layer = layerOf(incomingEl);
    if (!layer) {
      done();
      return;
    }
    const t = Math.min(1, (now - start) / ms);
    const eased = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
    layer.style.transition = 'none';
    layer.style.zIndex = '2';
    layer.style.opacity = String(t >= 1 ? 1 : eased);
    if (t < 1) {
      window.requestAnimationFrame(tick);
      return;
    }
    done();
  };
  window.requestAnimationFrame(tick);
}

// 재생 중 멈춰 기다릴 지점(영상 초). 숫자 배열이거나 영상 길이를 받는 함수다.
function speechStopsOf(shot, duration) {
  const raw = shot.speechStops;
  const list = typeof raw === 'function' ? raw(duration) : raw;
  if (!Array.isArray(list)) return [];
  return list.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
}

function Shot({ shot, shotIndex, clock, slotIndex, remember, onAdvance, onProgress, waitRef }) {
  const fired = useRef(false);
  const freezing = useRef(false);
  const held = useRef(false);
  const holdFrame = useRef(0);
  const goWait = useRef(0);
  // 재생 중 멘트 경계에서 멈춘 상태: 몇 번째 경계까지 지났는지, 지금 기다리는 중인지.
  const stopState = useRef({ passed: 0, waiting: false, timer: 0 });
  const nodeRef = useRef(null);
  const rememberRef = useRef(remember);
  const progressRef = useRef(onProgress);
  rememberRef.current = remember;
  progressRef.current = onProgress;

  const setNode = useCallback((node) => {
    nodeRef.current = node;
    rememberRef.current(slotIndex, node);
  }, [slotIndex]);

  const clearWaits = useCallback(() => {
    window.clearInterval(goWait.current);
    goWait.current = 0;
    window.clearInterval(stopState.current.timer);
    stopState.current = { passed: 0, waiting: false, timer: 0 };
  }, []);

  useEffect(() => {
    fired.current = false;
    held.current = false;
    freezing.current = false;
    window.clearInterval(holdFrame.current);
    clearWaits();
  }, [shot, clearWaits]);

  useEffect(() => () => {
    window.clearInterval(holdFrame.current);
    clearWaits();
  }, [clearWaits]);

  // 다음 영상으로. 아직 말하는 중이면 마지막 프레임에 머물렀다가 말이 끝난 뒤 넘어간다.
  const go = useCallback(() => {
    if (!clock || fired.current) return;
    if (stillSpeaking(waitRef)) {
      if (goWait.current) return;
      goWait.current = window.setInterval(() => {
        if (stillSpeaking(waitRef)) return;
        window.clearInterval(goWait.current);
        goWait.current = 0;
        goRef.current();
      }, WAIT_POLL_MS);
      return;
    }
    if (onAdvance()) fired.current = true;
  }, [clock, onAdvance, waitRef]);
  const goRef = useRef(go);
  goRef.current = go;

  // 재생 중 멘트 경계에 닿았는데 아직 말하는 중이면 영상을 멈추고, 말이 끝나면 이어서 튼다.
  // 멈춘 동안은 경계 직전 시간을 알려 줘서 멘트가 바뀌지 않게 한다. 멈출 필요가 없으면 true.
  const passStops = useCallback((video) => {
    const state = stopState.current;
    if (state.waiting) return false;
    const stop = speechStopsOf(shot, video.duration)[state.passed];
    if (stop == null || video.currentTime < stop - STOP_LOOKAHEAD_S) return true;
    if (!stillSpeaking(waitRef)) {
      state.passed += 1;
      return true;
    }
    state.waiting = true;
    video.pause();
    progressRef.current?.({
      index: shotIndex,
      time: Math.min(video.currentTime, stop - 0.01),
      duration: video.duration,
    });
    state.timer = window.setInterval(() => {
      if (stillSpeaking(waitRef)) return;
      window.clearInterval(state.timer);
      state.timer = 0;
      state.waiting = false;
      state.passed += 1;
      const pending = video.play();
      if (pending && pending.catch) pending.catch(() => {});
    }, WAIT_POLL_MS);
    return false;
  }, [shot, shotIndex, waitRef]);

  const startFreeze = useCallback((video) => {
    held.current = true;
    freezing.current = true;
    // 되감으면 화면이 몇 프레임 뒤로 튀므로, 멈춘 자리의 프레임을 그대로 둔다.
    video.pause();
    const freezeMs = shot.freezeMs || 0;
    // 멈춘 구간 안의 멘트 경계(freezeStops, ms)와 구간 끝. 말하는 중이면 경계 직전에서 시계를 세운다.
    const stops = [...(shot.freezeStops || []), freezeMs]
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    let last = performance.now();
    let elapsed = 0;
    let passed = 0;
    const tick = () => {
      if (!freezing.current) {
        window.clearInterval(holdFrame.current);
        return;
      }
      const now = performance.now();
      const delta = now - last;
      last = now;
      const stop = stops[passed];
      if (stop != null && elapsed + delta >= stop) {
        if (stillSpeaking(waitRef)) {
          elapsed = Math.max(elapsed, stop - 1);
        } else {
          elapsed += delta;
          passed += 1;
        }
      } else {
        elapsed += delta;
      }
      progressRef.current?.({
        index: shotIndex,
        time: shot.freezeAt,
        duration: video.duration,
        frozen: elapsed < freezeMs,
        freezeElapsed: elapsed,
        freezeMs,
      });
      if (elapsed < freezeMs) return;
      if (shot.advanceAfterFreeze) {
        // 앞 전환이 아직 끝나지 않아 거절되면 다음 틱에 다시 시도한다.
        goRef.current();
        if (!fired.current) return;
        window.clearInterval(holdFrame.current);
        freezing.current = false;
        return;
      }
      window.clearInterval(holdFrame.current);
      freezing.current = false;
      video.playbackRate = shot.slowRate || 0.2;
      const pending = video.play();
      if (pending && pending.catch) pending.catch(() => {});
    };
    window.clearInterval(holdFrame.current);
    holdFrame.current = window.setInterval(tick, 50);
    tick();
  }, [shot, shotIndex, waitRef]);

  useEffect(() => {
    const el = nodeRef.current;
    if (!clock || !el || el.tagName !== 'VIDEO') return undefined;
    el.dataset.live = '1';
    freezing.current = false;
    if (shot.freezeAt > 0) {
      el.playbackRate = shot.approachRate || 1;
    } else {
      syncRate(el, shot);
    }
    const pending = el.play();
    if (pending && pending.catch) pending.catch(() => {});
    return undefined;
  }, [clock, shot, shotIndex]);

  if (!shot) return null;

  if (shot.kind === 'video') {
    return (
      <div className={styles.shot}>
        <video
          ref={setNode}
          className={styles.media}
          src={shot.src}
          /* 첫 영상은 포스터(첫 프레임 사진)를 깔아 둔다. 영상이 디코딩되기 전까지 검은 화면이 보이지 않게. */
          poster={shot.poster}
          muted
          playsInline
          preload="auto"
          onLoadedData={(event) => {
            const video = event.currentTarget;
            if (video.dataset.live === '1') return;
            video.pause();
            if (video.currentTime > 0.04) {
              try {
                video.currentTime = 0;
              } catch {
                // metadata can arrive before seeking is allowed
              }
            }
          }}
          onSeeked={(event) => {
            if (!clock) return;
            syncRate(event.currentTarget, shot);
          }}
          onTimeUpdate={(event) => {
            if (!clock || freezing.current) return;
            const video = event.currentTarget;
            if (!video.duration || !Number.isFinite(video.duration)) return;
            if (!passStops(video)) return;
            if (shot.freezeAt > 0 && !held.current && video.currentTime >= shot.freezeAt) {
              startFreeze(video);
              return;
            }
            if (shot.freezeAt > 0 && !held.current) {
              video.playbackRate = shot.approachRate || 1;
              if (shot.advanceAfterFreeze) {
                onProgress?.({ index: shotIndex, time: video.currentTime, duration: video.duration });
              }
              return;
            }
            if (shot.advanceAfterFreeze) return;
            syncRate(video, shot);
            onProgress?.({ index: shotIndex, time: video.currentTime, duration: video.duration });
            if (video.duration - video.currentTime <= fadeOf(shot) / 1000) go();
          }}
          onEnded={(event) => {
            if (!clock) return;
            if (shot.freezeAt > 0 && !held.current) {
              startFreeze(event.currentTarget);
              return;
            }
            if (shot.advanceAfterFreeze) return;
            go();
          }}
          onError={() => {
            if (clock) go();
          }}
        />
      </div>
    );
  }

  return (
    <div className={styles.shot}>
      <img ref={setNode} className={styles.media} src={shot.src} alt="" draggable={false} />
    </div>
  );
}

// waitRef: current() 가 true 면 아직 멘트를 읽는 중. 멘트 경계(speechStops·freezeStops)와 영상 끝에서
// 말이 끝날 때까지 기다린다. 없으면 예전처럼 시간대로만 흐른다.
export default function Sequence({ shots, onDone, onProgress, waitRef }) {
  const refs = useRef([null, null]);
  const activeSlot = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(true);
  const [slots, setSlots] = useState(() => ([
    { shot: 0, clock: true },
    { shot: shots.length > 1 ? 1 : null, clock: false },
  ]));
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  const remember = useCallback((index, node) => {
    refs.current[index] = node;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    holdOpaque(layerOf(refs.current[0]), 2);
  }, []);

  useEffect(() => {
    if (shots.length) return undefined;
    const timer = window.setTimeout(onDone, 700);
    return () => window.clearTimeout(timer);
  }, [shots.length, onDone]);

  const advance = useCallback(() => {
    if (busy.current) return false;
    const active = activeSlot.current;
    const currentShot = slotsRef.current[active]?.shot ?? 0;
    const next = currentShot + 1;
    if (next >= shots.length) {
      busy.current = true;
      onDone();
      return true;
    }

    busy.current = true;
    const incoming = 1 - active;
    const fade = fadeOf(shots[currentShot]);
    const reveal = () => {
      if (!mounted.current) return;
      const incomingEl = refs.current[incoming];
      const outgoingEl = refs.current[active];
      if (incomingEl && incomingEl.tagName === 'VIDEO') {
        incomingEl.dataset.live = '1';
        if (incomingEl.currentTime > 0.05) {
          try {
            incomingEl.currentTime = 0;
          } catch {
            // seek can fail before the first frame is ready
          }
        }
        const opening = shots[next];
        if (opening && opening.freezeAt > 0) {
          incomingEl.playbackRate = opening.approachRate || 1;
        } else {
          incomingEl.playbackRate = rateForShot(opening, 0);
        }
        const pending = incomingEl.play();
        if (pending && pending.catch) pending.catch(() => {});
      }
      holdOpaque(layerOf(outgoingEl), 1);
      const holdCue = Boolean(shots[currentShot] && shots[currentShot].holdCue);
      setSlots((prev) => prev.map((slot, index) => {
        if (holdCue) {
          return index === incoming ? { shot: next, clock: false } : slot;
        }
        return index === incoming
          ? { shot: next, clock: true }
          : { ...slot, clock: false };
      }));
      if (!holdCue) activeSlot.current = incoming;
      fadeLayerIn(incomingEl, outgoingEl, fade, () => {
        if (!mounted.current) return;
        const hidden = refs.current[active];
        if (hidden && hidden.dataset) delete hidden.dataset.live;
        hideLayer(layerOf(hidden));
        if (holdCue) activeSlot.current = incoming;
        const following = next + 1;
        setSlots((prev) => prev.map((slot, index) => (
          index === incoming
            ? { shot: next, clock: true }
            : { shot: following < shots.length ? following : null, clock: false }
        )));
        busy.current = false;
      });
    };

    whenReady(refs.current[incoming]).then(reveal);
    return true;
  }, [onDone, shots]);

  useEffect(() => {
    const slotIndex = slots.findIndex((slot) => slot.clock);
    const slot = slots[slotIndex];
    const shot = slot && slot.shot != null ? shots[slot.shot] : null;
    if (!shot || shot.kind !== 'image') return undefined;
    const timer = window.setTimeout(() => {
      activeSlot.current = slotIndex;
      advance();
    }, Math.max(600, shot.ms || 2200));
    return () => window.clearTimeout(timer);
  }, [slots, shots, advance]);

  if (!shots.length) return null;

  return slots.map((slot, index) => (
    <Shot
      key={index}
      slotIndex={index}
      shot={slot.shot == null ? null : shots[slot.shot]}
      shotIndex={slot.shot}
      clock={slot.clock}
      remember={remember}
      onAdvance={advance}
      onProgress={onProgress}
      waitRef={waitRef}
    />
  ));
}
