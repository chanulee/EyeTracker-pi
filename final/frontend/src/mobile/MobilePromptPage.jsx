import styles from './MobilePromptPage.module.css';

/** 키오스크 /4 draw 단계와 동일 카피 — 두 명 접속 후 그리기 안내 */
export default function MobilePromptPage({ onStart, exiting = false }) {
  return (
    <div
      className={`${styles.artboard} ${exiting ? styles.artboardExiting : ''}`}
      data-figma-node="mobile-prompt"
    >
      <button type="button" className={styles.bubble} onClick={onStart}>
        <p className={styles.copy}>
          이 공간에 어떤 식물이 자라면 좋을까요?
          <br />
          <span className={styles.copyStrong}>모바일 화면에 원하는 식물을 그려주세요</span>
        </p>
      </button>
      <p className={styles.srOnly} role="status">
        화면을 눌러 그리기를 시작할 수 있습니다
      </p>
    </div>
  );
}
