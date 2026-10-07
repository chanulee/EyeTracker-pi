import MobilePlantNameChip from './MobilePlantNameChip';
import { END_PLANT_VARIANTS } from './mobileEndPlantVariants';
import styles from './MobileEndPage.module.css';

/** Figma 1926:5223 — 전송 확인 (블롭 + 구별 3D 식물) */
export default function MobileEndPage({
  plantName = '',
  plantVariant = null,
  enterFromTag = false,
  onSend,
}) {
  const variant = plantVariant ?? END_PLANT_VARIANTS['jongno-a'];

  // 전송 화면에서는 원(블롭) 대비 식물 자체가 더 커 보이도록 공통 배율을 추가한다.
  const PLANT_SCALE_MULTIPLIER = 1.24;
  const resolvedScale = (variant.scale ?? 1) * PLANT_SCALE_MULTIPLIER;

  const plantFrameStyle = {
    transform: [
      variant.offsetY ? `translateY(${variant.offsetY}px)` : '',
      variant.rotate ? `rotate(${variant.rotate}deg)` : '',
      `scale(${resolvedScale.toFixed(3)})`,
    ]
      .filter(Boolean)
      .join(' '),
  };

  return (
    <div
      className={`${styles.artboard} ${enterFromTag ? styles.artboardEnter : ''}`}
      data-figma-node="1926:5223"
    >
      <div className={styles.gradient} aria-hidden="true" />
      <header className={styles.copy} data-figma-node="1926:5238">
        <h1 className={styles.title}>전송할까요?</h1>
        <div className={styles.lead}>
          <p className={styles.leadLine}>심을 준비가 완료되었어요! </p>
          <p className={`${styles.leadLine} ${styles.leadStrong}`}>
            전송 버튼을 누르면 새싹이 화면으로 이동해요.
          </p>
        </div>
      </header>
      <div className={styles.blobStack} aria-hidden="true">
        <div className={styles.blobDisc}>
          <div className={styles.blobHalo} />
          <div className={styles.plantClip} data-variant={variant.id}>
            <div className={styles.plantFrame} style={plantFrameStyle}>
              <img
                className={styles.plantImg}
                src={variant.image}
                alt=""
                decoding="async"
                draggable={false}
                style={{
                  objectPosition: variant.objectPosition ?? 'center',
                }}
              />
            </div>
          </div>
        </div>
      </div>
      <div className={styles.nameChipSlot}>
        <MobilePlantNameChip name={plantName} />
      </div>
      <button type="button" className={styles.sendBtn} data-figma-node="1926:5235" onClick={onSend}>
        <span className={styles.sendBtnBg} aria-hidden="true" />
        <span className={styles.sendBtnLabel}>전송</span>
      </button>
    </div>
  );
}
