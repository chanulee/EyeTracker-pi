import { useEffect, useRef } from 'react';
import { MOBILE_LOADING_VIDEO_SRC } from './mobileConfig';
import styles from './MobilePlantVideo.module.css';

/** Figma 1690:706 — 로딩·드로잉 공통 식물 영상 배경 */
export default function MobilePlantVideo({
  videoSrc = MOBILE_LOADING_VIDEO_SRC,
  onEnded,
  loop = false,
  paused = false,
}) {
  const videoRef = useRef(null);

  // 대기 화면 → 그림판 전환 시 현재 프레임에서 자연스럽게 정지(배경 고정)
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (paused) {
      el.pause();
    } else {
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  }, [paused]);

  return (
    <div className={styles.slot} data-figma-node="1690:706" aria-hidden="true">
      <video
        ref={videoRef}
        className={styles.video}
        src={videoSrc}
        autoPlay
        muted
        playsInline
        preload="auto"
        loop={loop && !paused}
        onEnded={loop ? undefined : onEnded}
      />
    </div>
  );
}
