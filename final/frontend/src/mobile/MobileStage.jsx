import { useRef } from 'react';
import styles from './MobileStage.module.css';
import { useMobileStageScale } from './useMobileStageScale';

/**
 * Figma 아트보드(480×1044)를 뷰포트에 맞춘다.
 * @param {'mobile' | 'width' | 'contain' | 'cover'} fit — mobile: 가로 우선·하단 안 잘림
 */
export function MobileStage({ width, height, fit = 'contain', children }) {
  const viewportRef = useRef(null);
  const scale = useMobileStageScale(viewportRef, width, height, fit);

  return (
    <div className={styles.viewport} ref={viewportRef}>
      <div
        className={styles.stageOuter}
        style={{ width: width * scale, height: height * scale }}
      >
        <div
          className={styles.stage}
          style={{ width, height, transform: `scale(${scale})` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
