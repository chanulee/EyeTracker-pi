import styles from './CalibrationOverlay.module.css';
import {
  NABI_BADGE_TEXT_SVG,
  SORA_BADGE_BACKGROUND_SVG,
} from './nabiCalibrationBadgeAssets';
import { CALIBRATION_TARGET_SVG } from './calibrationTargetAsset';

/**
 * 사람별로 차례대로 진행하는 보정·검증 오버레이.
 *
 * 각 단계 앞에 대기 화면을 띄워 해당 사람이 자리에 앉을 시간을 준다.
 * 타깃 이동만 React 가 맡고 수집 진행 애니메이션은 CSS 로 돌려서 프레임마다 리렌더하지 않는다.
 */
export default function CalibrationOverlay({
  ready,
  point,
  index,
  total,
  phase,
  mode,
  collectMs,
  personLabel,
  color,
  stageIndex,
  stageTotal,
  summary,
  onStart,
  embedded = false,
}) {
  const title = mode === 'validate' ? '정확도 측정' : '시선 보정';

  if (!ready) {
    return (
      <div className={styles.overlay}>
        <div className={styles.intro}>
          {summary && (
            <div className={styles.summary}>
              <b>{summary.personLabel} 완료</b>
              {summary.rows.map((row) => (
                <span key={row.key}>{row.value.toFixed(0)}px</span>
              ))}
            </div>
          )}

          <p className={styles.step}>
            {stageIndex + 1} / {stageTotal} 단계
          </p>
          <h2 className={styles.introTitle} style={{ color }}>
            {personLabel}
          </h2>
          <p className={styles.desc}>
            {personLabel}가 화면 앞에 자리를 잡고, 미리보기에서 얼굴이 잡히는지 확인한 뒤
            시작하세요. 진행 중에는 고개를 크게 움직이지 말고 점만 눈으로 따라가세요.
          </p>
          <button type="button" className={styles.startBtn} onClick={onStart} autoFocus>
            {title} 시작 (Space)
          </button>
          <p className={styles.descDim}>ESC 로 취소</p>
        </div>
      </div>
    );
  }

  if (!point) return null;

  // 차오르는 게이지(.fill) 색은 사람별로 다르게 — NABI 초록 / SORA 보라 (적당한 채도).
  const fillColor =
    personLabel === 'NABI'
      ? 'rgba(124, 201, 130, 0.5)'
      : personLabel === 'SORA'
        ? 'rgba(170, 120, 214, 0.5)'
        : 'rgba(255, 255, 255, 0.42)';

  return (
    <div className={`${styles.overlay} ${embedded ? styles.overlayEmbedded : ''}`}>
      {personLabel === 'NABI' || personLabel === 'SORA' ? (
        <div className={styles.nabiHud} aria-hidden="true">
          {personLabel === 'NABI' ? (
            <div
              className={styles.nabiHudText}
              dangerouslySetInnerHTML={{ __html: NABI_BADGE_TEXT_SVG }}
            />
          ) : (
            <div className={`${styles.nabiHudText} ${styles.soraHudText}`}>
              <div
                className={styles.soraBadgeSvg}
                dangerouslySetInnerHTML={{ __html: SORA_BADGE_BACKGROUND_SVG }}
              />
              <span className={styles.soraBadgeText}>
                SORA님, 점 한가운데를 계속 응시하세요
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.hud}>
          <span className={styles.badge} style={{ borderColor: color }}>
            {title} · {personLabel}
          </span>
          <span>
            {index + 1} / {total}
          </span>
        </div>
      )}

      <div
        className={styles.target}
        style={{
          left: `${point.x * 100}%`,
          top: `${point.y * 100}%`,
          '--target-color': color,
          '--fill-color': fillColor,
        }}
        data-phase={phase}
      >
        <div
          className={styles.glass}
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: CALIBRATION_TARGET_SVG }}
        />
        <div
          className={styles.fill}
          style={{ animationDuration: `${collectMs}ms` }}
          key={`${stageIndex}-${index}-${phase}`}
        />
        <div className={styles.core} />
      </div>
    </div>
  );
}
