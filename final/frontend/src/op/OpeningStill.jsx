import { useEffect, useRef, useState } from 'react';
import OpeningAgent from './OpeningAgent';
import { PRE_OPENING_CLIP } from './attractClips';
import stageStyles from './Opening.module.css';
import styles from './OpeningStill.module.css';

const STAGE = { width: 3881, height: 2183 };
const FIGMA = { width: 4074, height: 2274 };
const SX = STAGE.width / FIGMA.width;
const SY = STAGE.height / FIGMA.height;
const AGENT_SOURCE = 960;
const ORB_RADIUS = 0.72;

function agentStyle() {
  const diameter = 2567;
  const centerY = 2577.5;
  const visual = diameter * SX * (0.88 / ORB_RADIUS);
  const scale = visual / AGENT_SOURCE;
  const x = STAGE.width / 2 - visual / 2;
  const y = centerY * SY - visual / 2;
  return {
    width: AGENT_SOURCE,
    height: AGENT_SOURCE,
    transform: `translate(${x}px, ${y}px) scale(${scale})`,
    transformOrigin: '0 0',
  };
}

function OnceVideo({ src, durationMs, onEnded }) {
  const videoRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    doneRef.current = false;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    const pending = video.play();
    if (pending) pending.catch(() => {});

    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onEnded?.();
    };
    const watchdog = window.setTimeout(finish, durationMs + 400);
    video.addEventListener('ended', finish);
    return () => {
      window.clearTimeout(watchdog);
      video.removeEventListener('ended', finish);
    };
  }, [src, durationMs, onEnded]);

  return <video ref={videoRef} className={styles.video} src={src} muted playsInline preload="auto" />;
}

export default function OpeningStill({ onEnded }) {
  const viewportRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => {
      const box = viewportRef.current;
      const width = box?.clientWidth || window.innerWidth;
      const height = box?.clientHeight || window.innerHeight;
      const next = Math.max(width / STAGE.width, height / STAGE.height);
      setScale(next > 0 ? next : 1);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <div className={stageStyles.viewport} ref={viewportRef} data-opening-still style={{ background: '#000' }}>
      <div className={stageStyles.fit} style={{ width: STAGE.width * scale, height: STAGE.height * scale }}>
        <div role="application" aria-label="Opening still" className={stageStyles.stage} style={{ transform: `scale(${scale})` }}>
          <OnceVideo src={PRE_OPENING_CLIP.src} durationMs={PRE_OPENING_CLIP.durationMs} onEnded={onEnded} />
          <div className={stageStyles.agentMove} style={agentStyle()}>
            <div className={`${stageStyles.agentFloat} ${stageStyles.agentSpeaking}`}>
              <OpeningAgent speaking />
            </div>
          </div>
          <div className={styles.titleBoard}>
            <p className={stageStyles.wordmark} aria-hidden="true">ONSI</p>
            <p className={stageStyles.tagline} aria-hidden="true">A Green City Cultivated by a Warm Gaze</p>
          </div>
        </div>
      </div>
    </div>
  );
}
