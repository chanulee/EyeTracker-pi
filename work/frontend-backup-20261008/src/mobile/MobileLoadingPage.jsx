import styles from './MobileLoadingPage.module.css';

/** Figma 1690:702 — 로딩 UI (1690:706 영상은 MobileScreen 공통 배경). */
export default function MobileLoadingPage({
  districtName = '종로구',
  loadingLead = '나만의 식물을 그려볼 준비, 되셨나요?',
  waitingForPeer = false,
  exiting = false,
}) {
  return (
      <div
        className={`${styles.artboard} ${exiting ? styles.artboardExiting : ''}`}
        data-figma-node="1690:702"
      >
        <header className={styles.copy} data-figma-node="1690:710">
          <h1 className={styles.district}>{districtName}</h1>
          <p className={styles.lead}>
            {waitingForPeer ? '다른 분의 접속을 기다리는 중이에요…' : loadingLead}
          </p>
        </header>
        <p className={styles.srOnly} role="status" aria-live="polite">
          로딩 영상 재생 중
        </p>
      </div>
  );
}
