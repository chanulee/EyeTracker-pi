import MobilePlantNameChip from './MobilePlantNameChip';
import styles from './MobileConvertPage.module.css';

/** Figma 1878:2912 — 새싹 변환 대기 */
export default function MobileConvertPage({
  plantName = '',
  drawingUrl = null,
  enterFromTag = false,
  exiting = false,
}) {
  const displayName = plantName.trim() || '—';

  return (
    <div
      className={`${styles.artboard} ${enterFromTag ? styles.artboardEnter : ''} ${
        exiting ? styles.artboardExiting : ''
      }`}
      data-figma-node="1878:2912"
    >
      <div className={styles.gradient} aria-hidden="true" />
      <header className={styles.copy} data-figma-node="1878:2920">
        <h1 className={styles.title}>잠시만 기다려 주세요</h1>
        <div className={styles.lead}>
          <p className={styles.leadLine}>그려주신 식물을 심을 수 있도록</p>
          <p className={`${styles.leadLine} ${styles.leadStrong}`}>
            새싹 이미지로 변환하는 중이에요...
          </p>
        </div>
      </header>
      <div className={styles.visual} aria-hidden="true" data-figma-node="1878:2970">
        <div className={styles.glowRing} />
        <div className={styles.glowCore} />
        <div className={styles.drawingClip}>
          {drawingUrl ? (
            <img
              className={styles.userDrawing}
              src={drawingUrl}
              alt=""
              decoding="sync"
              draggable={false}
            />
          ) : null}
        </div>
      </div>
      <div className={styles.nameChipSlot}>
        <MobilePlantNameChip name={displayName === '—' ? '' : displayName} />
      </div>
      <p className={styles.srOnly} role="status" aria-live="polite">
        식물 이미지를 새싹으로 변환하는 중입니다
      </p>
    </div>
  );
}
