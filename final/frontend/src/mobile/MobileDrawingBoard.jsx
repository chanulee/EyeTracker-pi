import styles from './MobileDrawingPage.module.css';

/** 2·3화면 동일 드로잉 보드 shell (Figma 1693:944/945) */
export default function MobileDrawingBoard({
  shellClassName = '',
  dataFigmaShell = '1693:944',
  dataFigmaPanel = '1693:945',
  children,
  chrome = null,
}) {
  return (
    <div
      className={`${styles.canvasPanelShell} ${shellClassName}`.trim()}
      data-figma-node={dataFigmaShell}
    >
      <div className={styles.canvasPanel} data-figma-node={dataFigmaPanel}>
        <div className={styles.canvasPanelFrostFull} aria-hidden="true" />
        <div className={styles.drawSurface}>{children}</div>
        {chrome}
      </div>
    </div>
  );
}
