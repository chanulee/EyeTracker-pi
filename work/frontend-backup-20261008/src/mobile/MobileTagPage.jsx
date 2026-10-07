import styles from './MobileTagPage.module.css';

/** Figma 1693:892 — 식물 이름(태그) */
export default function MobileTagPage({ enterFromSave = false, onStartNaming }) {
  return (
    <div
      className={`${styles.artboard} ${enterFromSave ? styles.artboardEnter : ''}`}
      data-figma-node="1693:892"
    >
      <div className={`${styles.blurVeil} ${styles.blurVeilSoft}`} aria-hidden="true" data-figma-node="1693:898" />
      <header className={styles.copy} data-figma-node="1693:900">
        <h1 className={styles.title}>
          <span className={styles.titleLine}>멋진 식물이에요!</span>
          <span className={styles.titleLine}>이름을 붙여주세요</span>
        </h1>
        <div className={styles.lead}>
          <p className={styles.leadLine}>
            <span className={styles.leadStrong}>식물의 특징이나 쓰임새</span>
            <span> 등 </span>
          </p>
          <p className={styles.leadLine}>자유롭게 생각해 이름을 적어주세요.</p>
        </div>
      </header>
      <button
        type="button"
        className={styles.namePromptBtn}
        data-figma-node="1693:903"
        onClick={onStartNaming}
      >
        <span className={styles.namePromptLabel}>이 식물의 이름은 무엇인가요?</span>
      </button>
    </div>
  );
}
