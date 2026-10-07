import MobilePlantNameChip from './MobilePlantNameChip';
import { END_PLANT_VARIANTS } from './mobileEndPlantVariants';
import styles from './MobileCompletePage.module.css';

/**
 * 체험 완료 및 전송 완료 안내 화면
 * 전송 완료 후 참여 인원(WebSocket)에서 완전히 배제되며,
 * 본인이 지은 이름 캡슐과 완성된 식물이 잔잔하게 표시됨.
 */
export default function MobileCompletePage({ plantName = '', plantVariant = null }) {
  const clean = typeof plantName === 'string' ? plantName.trim() : '';
  const displayName = clean && clean !== 'undefined' ? clean : '나만의 새싹';
  const variant = plantVariant ?? END_PLANT_VARIANTS['jongno-a'];

  const resolvedScale = (variant?.scale ?? 1) * 1.15;
  const plantFrameStyle = {
    transform: [
      variant?.offsetY ? `translateY(${variant.offsetY}px)` : '',
      variant?.rotate ? `rotate(${variant.rotate}deg)` : '',
      `scale(${resolvedScale.toFixed(3)})`,
    ]
      .filter(Boolean)
      .join(' '),
  };

  return (
    <div className={`${styles.artboard} ${styles.artboardEnter}`}>
      <div className={styles.gradient} aria-hidden="true" />

      <header className={styles.copy}>
        <h1 className={styles.title}>체험이 완료되었어요!</h1>
        <div className={styles.lead}>
          <p className={styles.leadLine}>
            <span className={styles.leadStrong}>{displayName}</span>이(가)
          </p>
          <p className={styles.leadLine}>
            큰 화면(키오스크)으로 이동했습니다.
          </p>
        </div>
      </header>

      <div className={styles.blobStack} aria-hidden="true">
        <div className={styles.blobDisc}>
          <div className={styles.blobHalo} />
          {variant && (
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
          )}
        </div>
      </div>

      <div className={styles.nameChipSlot}>
        <MobilePlantNameChip name={displayName} />
      </div>

      <div className={styles.noticeBox}>
        <div className={styles.badgeRow}>
          <span className={styles.completedBadge}>
            <svg
              className={styles.checkIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            참여 완료됨
          </span>
        </div>
        <p className={styles.noticeText}>
          스마트폰 연결이 정상적으로 종료되었습니다.
          <span className={styles.noticeSub}>
            키오스크 화면에서 내 식물이 자라나는 모습을 확인해 보세요!
          </span>
        </p>
      </div>
    </div>
  );
}
