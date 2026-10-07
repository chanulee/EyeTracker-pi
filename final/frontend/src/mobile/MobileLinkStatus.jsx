import { useMobileLink } from '../shared/mobileLink/MobileLinkContext';
import styles from './MobileLinkStatus.module.css';

/** /mobile — 키오스크 WebSocket 연결 상태 (join 쿼리 있을 때) */
export default function MobileLinkStatus() {
  const { status, isPaired, lastError } = useMobileLink();

  if (status === 'idle' || status === 'closed') return null;

  let label = '키오스크에 연결 중…';
  if (isPaired) label = '키오스크와 연결됨';
  else if (status === 'waiting_kiosk') label = '키오스크 대기 중…';
  else if (status === 'error') label = lastError || '연결 오류';

  return (
    <p className={`${styles.banner} ${isPaired ? styles.paired : ''}`} role="status" aria-live="polite">
      {label}
    </p>
  );
}
