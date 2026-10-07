import MobileDrawingBoard from './MobileDrawingBoard';
import MobileDrawingLead from './MobileDrawingLead';
import { DEFAULT_MOBILE_DISTRICT_COPY_RESOLVED } from './mobileDistrictCopy';
import drawingStyles from './MobileDrawingPage.module.css';
import styles from './MobileSavePage.module.css';

/** Figma 1693:965 — 세이브(미리보기) */
export default function MobileSavePage({
  districtName = '종로구',
  drawingLeadLines = DEFAULT_MOBILE_DISTRICT_COPY_RESOLVED.drawingLeadLines,
  tags = DEFAULT_MOBILE_DISTRICT_COPY_RESOLVED.tags,
  drawingUrl = null,
  enterFromDrawing = false,
  exiting = false,
  drawingLayerVisible = false,
  onComplete,
}) {
  const handoffFromDrawing = enterFromDrawing && drawingLayerVisible;
  const showSaveBoard = !handoffFromDrawing;
  return (
    <div
      className={`${styles.artboard} ${enterFromDrawing ? styles.artboardEnter : ''} ${
        enterFromDrawing ? styles.artboardEnterFromDrawing : ''
      } ${exiting ? styles.artboardExiting : ''}`}
      data-figma-node="1693:965"
    >
      <header className={styles.copy} data-figma-node="1693:982">
        <h1 className={styles.district}>{districtName}</h1>
        <MobileDrawingLead
          lines={drawingLeadLines}
          leadClassName={styles.lead}
          strongClassName={drawingStyles.leadStrong}
        />
      </header>
      <div className={styles.tags} data-figma-node="1693:975">
        {tags.map((label, index) => (
          <span
            key={label}
            className={`${styles.tag} ${index === tags.length - 1 ? styles.tagMuted : ''}`}
          >
            {label}
          </span>
        ))}
      </div>
      {drawingUrl && handoffFromDrawing ? (
        <img
          className={styles.savePreviewPreload}
          src={drawingUrl}
          alt=""
          decoding="sync"
          draggable={false}
          aria-hidden="true"
        />
      ) : null}
      {showSaveBoard ? (
        <MobileDrawingBoard
          shellClassName={styles.savePanelShell}
          dataFigmaShell="1693:973"
          dataFigmaPanel="1693:973"
        >
          {drawingUrl ? (
            <img
              className={drawingStyles.drawSurfacePreview}
              src={drawingUrl}
              alt=""
              decoding="sync"
              draggable={false}
            />
          ) : null}
        </MobileDrawingBoard>
      ) : null}
      <button
        type="button"
        className={`${drawingStyles.nextBtn} ${styles.completeBtn}`}
        data-figma-node="1693:985"
        onClick={onComplete}
      >
        <span className={drawingStyles.nextBg} aria-hidden="true" />
        <span className={drawingStyles.nextLabel}>내 식물 완성하기</span>
      </button>
    </div>
  );
}
