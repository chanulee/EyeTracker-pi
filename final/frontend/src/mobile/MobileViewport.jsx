import { useRef } from 'react';
import styles from './MobileViewport.module.css';
import { useMobileViewportLayout } from './useMobileViewportLayout';

/**
 * 실기기(iPhone·Galaxy 등) visualViewport + 회전에 맞춘 전체 화면 프레임.
 */
export default function MobileViewport({ children }) {
  const safeRef = useRef(null);
  useMobileViewportLayout(safeRef);

  return (
    <div className={styles.chrome}>
      <div className={styles.frame}>
        <div className={styles.safe} ref={safeRef}>
          {children}
        </div>
      </div>
    </div>
  );
}
