import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import OpeningStill from '../src/op/OpeningStill';
import SequenceSlot from '../src/op/SequenceSlot';
import { PRE_OPENING_CLIP, SEQUENCE_CLIP } from '../src/op/attractClips';
import usePresenceLink from '../src/shared/gaze/usePresenceLink';
import { useEntryFlow } from '../src/shared/EntryFlowContext';
import { trackedPlayers } from '../src/shared/piSensors/presence.mjs';
import { advanceHold } from '../src/shared/gaze/presence';

const PI_GAZE = process.env.NEXT_PUBLIC_GAZE_SOURCE === 'pi';

const ONE_WARM = ['/op/city-sharp.png', '/op/title-bg.png'];

const DEBUG_STYLE = {
  position: 'fixed',
  left: 16,
  bottom: 16,
  zIndex: 50,
  padding: '10px 14px',
  borderRadius: 8,
  background: 'rgba(0, 0, 0, 0.7)',
  color: '#fff',
  font: '14px/1.5 monospace',
  whiteSpace: 'pre',
  pointerEvents: 'none',
};

/**
 * 0·1명: 기존 3초 영상 → 시퀀스 22초 영상 → 반복.
 * 2인 착용(통과 신호): 같은 3초+22초를 끝까지 본 뒤 /1 로 간다. 통과가 중간에 와도 영상을 끊지 않는다.
 */
export default function PreOpeningPage() {
  const router = useRouter();
  const { diagRef } = useEntryFlow();
  const debug = router.query.presenceDebug === '1';
  const [sensorState, setSensorState] = useState(null);
  const [clipId, setClipId] = useState(PRE_OPENING_CLIP.id);
  const [cycle, setCycle] = useState(0);
  const [armed, setArmed] = useState(false);
  const [cueEnd, setCueEnd] = useState(false);
  const armedRef = useRef(false);
  const leftRef = useRef(false);

  const goNext = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
    if (typeof document === 'undefined' || !document.startViewTransition) {
      router.replace('/1');
      return;
    }
    document.documentElement.classList.add('pre-opening-one-transition');
    const transition = document.startViewTransition(() => router.replace('/1'));
    transition.finished.finally(() => {
      document.documentElement.classList.remove('pre-opening-one-transition');
    });
  }, [router]);

  useEffect(() => {
    router.prefetch('/1');
    ONE_WARM.forEach((src) => {
      const image = new Image();
      image.src = src;
    });
  }, [router]);

  const arm = useCallback(() => {
    if (armedRef.current) return;
    armedRef.current = true;
    setArmed(true);
  }, []);

  const previewHandoff = useCallback(() => {
    arm();
    setCueEnd(true);
    setClipId(SEQUENCE_CLIP.id);
  }, [arm]);

  useEffect(() => {
    if (!router.isReady || router.query.preview !== '1') return;
    previewHandoff();
  }, [router.isReady, router.query.preview, previewHandoff]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== '1') return;
      previewHandoff();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewHandoff]);

  const onPreEnded = useCallback(() => {
    setClipId(SEQUENCE_CLIP.id);
  }, []);

  const onSequenceEnded = useCallback(() => {
    if (armedRef.current) {
      goNext();
      return;
    }
    setClipId(PRE_OPENING_CLIP.id);
    setCycle((current) => current + 1);
  }, [goNext]);

  const onMessage = useCallback(
    (msg) => {
      if (msg.type === 'pass' || (msg.type === 'joined' && msg.passAt)) arm();
      if (msg.type === 'state' || (msg.type === 'joined' && msg.state)) setSensorState(msg.state || msg);
    },
    [arm]
  );

  const link = usePresenceLink('display', onMessage, !PI_GAZE);
  useEffect(() => {
    if (!PI_GAZE) return undefined;
    const hold = { heldMs: 0, lastOkAt: 0 };
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const count = trackedPlayers(diagRef.current, now).length;
      const progress = advanceHold(hold, count >= 1, now, now - previous, { holdMs: 3200, graceMs: 350 });
      previous = now;
      if (debug) setSensorState({ faces: count, kept: count, progress });
      if (count >= 1 && progress >= 1) arm();
    }, 100);
    return () => clearInterval(timer);
  }, [diagRef, debug, arm]);

  const debugText = [
    PI_GAZE ? '입장 감지: 1P 눈 카메라 한 대' : `서버 ${link.connected ? '연결됨' : '끊김'} · 센서 ${link.peers.sensors}대`,
    sensorState
      ? `얼굴 ${sensorState.faces}명 · 통과 ${sensorState.kept}명 · ${Math.round((sensorState.progress || 0) * 100)}%`
      : '센서 신호 없음',
    `클립 ${clipId === SEQUENCE_CLIP.id ? '시퀀스 22초' : '기존 3초'} · ${armed ? '착용됨 → 시퀀스 후 /1' : '루프'}`,
  ].join('\n');

  return (
    <>
      <Head>
        <title>Plant Your Seoul — Pre-opening</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </Head>
      <video src={SEQUENCE_CLIP.src} preload="auto" muted playsInline hidden aria-hidden="true" />
      <div data-attract-clip={clipId} data-attract-armed={armed ? '1' : '0'}>
        {clipId === PRE_OPENING_CLIP.id ? (
          <OpeningStill key={cycle} onEnded={onPreEnded} />
        ) : (
          <SequenceSlot
            src={SEQUENCE_CLIP.src}
            durationMs={SEQUENCE_CLIP.durationMs}
            onEnded={onSequenceEnded}
            cueEnd={cueEnd}
          />
        )}
      </div>
      {debug && <div style={DEBUG_STYLE}>{debugText}</div>}
    </>
  );
}
