import { useEffect, useRef, useState } from 'react';
import OpeningAgent from './OpeningAgent';
import stageStyles from './Opening.module.css';
import styles from './OpeningStill.module.css';

const STAGE = { width: 3881, height: 2183 };
const FIGMA = { width: 4074, height: 2274 };
const SX = STAGE.width / FIGMA.width;
const SY = STAGE.height / FIGMA.height;
const AGENT_SOURCE = 960;
const ORB_RADIUS = 0.72;
const VIDEO_SRC = '/still/opening-sequence.mp4';

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

function SeamlessVideo({ src }) {
  const firstRef = useRef(null);
  const secondRef = useRef(null);
  const activeRef = useRef(0);

  useEffect(() => {
    const videos = [firstRef.current, secondRef.current];
    let frame = 0;
    let alive = true;

    const play = (video) => {
      const pending = video.play();
      if (pending) pending.catch(() => {});
    };

    const warm = (video) => {
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.currentTime = 0;
      const pending = video.play();
      if (!pending) {
        video.pause();
        return;
      }
      pending.then(() => {
        if (video !== videos[activeRef.current]) {
          video.pause();
          video.currentTime = 0;
        }
      }).catch(() => {});
    };

    videos.forEach(warm);
    play(videos[0]);

    const tick = () => {
      if (!alive) return;
      const current = videos[activeRef.current];
      const next = videos[1 - activeRef.current];
      const duration = current.duration;
      if (duration && Number.isFinite(duration) && duration - current.currentTime <= 1 / 24) {
        next.currentTime = 0;
        next.style.opacity = '1';
        play(next);
        current.style.opacity = '0';
        current.pause();
        current.currentTime = 0;
        activeRef.current = 1 - activeRef.current;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, [src]);

  return (
    <>
      <video ref={firstRef} className={styles.video} src={src} muted playsInline />
      <video ref={secondRef} className={`${styles.video} ${styles.videoNext}`} src={src} muted playsInline />
    </>
  );
}

export default function OpeningStill() {
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
          <SeamlessVideo src={VIDEO_SRC} />
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
