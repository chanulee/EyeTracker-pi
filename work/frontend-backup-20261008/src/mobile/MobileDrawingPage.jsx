import { useRef, useState } from 'react';
import { DRAWING_COLORS } from './drawingConfig';
import MobileDrawingBoard from './MobileDrawingBoard';
import MobileDrawingLead from './MobileDrawingLead';
import { DEFAULT_MOBILE_DISTRICT_COPY_RESOLVED } from './mobileDistrictCopy';
import { usePlantDrawing } from './usePlantDrawing';
import styles from './MobileDrawingPage.module.css';

/** Figma 1672:833 — 드로잉 인풋 */
export default function MobileDrawingPage({
  districtName = '종로구',
  drawingLeadLines = DEFAULT_MOBILE_DISTRICT_COPY_RESOLVED.drawingLeadLines,
  tags = DEFAULT_MOBILE_DISTRICT_COPY_RESOLVED.tags,
  enterFromLoading = false,
  exiting = false,
  onNext,
}) {
  const canvasRef = useRef(null);
  const [color, setColor] = useState(DRAWING_COLORS[3].value);
  const { onPointerDown, onPointerMove, onPointerUp, undo, getExportDataUrl, hasDrawing } =
    usePlantDrawing(canvasRef, color);

  const handleNext = () => {
    if (!hasDrawing) return;
    onNext?.(getExportDataUrl());
  };

  return (
    <div
      className={`${styles.artboard} ${enterFromLoading ? styles.artboardEnter : ''} ${
        exiting ? styles.artboardExiting : ''
      }`}
      data-figma-node="1672:833"
    >
      <header className={styles.copy} data-figma-node="1672:1111">
        <h1 className={styles.district}>{districtName}</h1>
        <MobileDrawingLead
          lines={drawingLeadLines}
          leadClassName={styles.lead}
          strongClassName={styles.leadStrong}
        />
      </header>
      <div className={styles.tags} data-figma-node="1672:861">
        {tags.map((label, index) => (
          <span
            key={label}
            className={`${styles.tag} ${index === tags.length - 1 ? styles.tagMuted : ''}`}
          >
            {label}
          </span>
        ))}
      </div>
      <MobileDrawingBoard
        chrome={
          <>
            <button
              type="button"
              className={styles.undoBtn}
              aria-label="되돌리기"
              onClick={(event) => {
                event.stopPropagation();
                undo();
              }}
            >
              <img src="/mobile/icon-undo.svg" alt="" />
            </button>
            <div className={styles.paletteWrap} data-figma-node="1672:1115">
              <img
                className={styles.paletteTray}
                src="/mobile/palette-tray.svg"
                alt=""
                aria-hidden="true"
              />
              <div className={styles.paletteSwatches} data-figma-node="1672:1116">
                {DRAWING_COLORS.map((swatch) => (
                  <button
                    key={swatch.id}
                    type="button"
                    className={`${styles.swatch} ${color === swatch.value ? styles.swatchSelected : ''}`}
                    style={{ background: swatch.gradient }}
                    aria-label={`색 ${swatch.id}`}
                    aria-pressed={color === swatch.value}
                    onClick={() => setColor(swatch.value)}
                  />
                ))}
              </div>
            </div>
          </>
        }
      >
        <canvas
          ref={canvasRef}
          className={styles.drawCanvas}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </MobileDrawingBoard>
      <button
        type="button"
        className={`${styles.nextBtn} ${hasDrawing ? styles.nextBtnActive : styles.nextBtnDisabled}`}
        data-figma-node="1692:696"
        disabled={!hasDrawing}
        aria-disabled={!hasDrawing}
        onClick={handleNext}
      >
        <span className={styles.nextBg} aria-hidden="true" />
        <span className={styles.nextLabel}>다음</span>
      </button>
    </div>
  );
}
