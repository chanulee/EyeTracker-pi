import { useEffect, useRef } from 'react';
import tagStyles from './MobileTagPage.module.css';
import styles from './MobileTag2Page.module.css';

/** Figma 1693:909 — 이름 입력(키보드) */
export default function MobileTag2Page({
  plantName = '',
  exiting = false,
  onPlantNameChange,
  onConfirmName,
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  const submit = () => {
    const trimmed = plantName.trim();
    if (!trimmed) return;
    onConfirmName?.(trimmed);
  };

  return (
    <div
      className={`${tagStyles.artboard} ${exiting ? styles.artboardExiting : ''}`}
      data-figma-node="1693:909"
    >
      <div
        className={`${tagStyles.blurVeil} ${tagStyles.blurVeilSoft}`}
        aria-hidden="true"
        data-figma-node="1693:915"
      />
      <header className={`${tagStyles.copy} ${styles.tagCopy}`} data-figma-node="1693:917">
        <h1 className={tagStyles.title}>
          <span className={tagStyles.titleLine}>멋진 식물이에요!</span>
          <span className={tagStyles.titleLine}>이름을 붙여주세요</span>
        </h1>
        <div className={tagStyles.lead}>
          <p className={tagStyles.leadLine}>
            <span className={tagStyles.leadStrong}>식물의 특징이나 쓰임새</span>
            <span> 등 </span>
          </p>
          <p className={tagStyles.leadLine}>자유롭게 생각해 이름을 적어주세요.</p>
        </div>
      </header>
      <label
        className={`${styles.nameField} ${plantName ? '' : styles.nameFieldEmpty}`}
        data-figma-node="1693:920"
      >
        <span className={styles.nameFieldBg} aria-hidden="true" />
        {!plantName ? (
          <span className={styles.nameFieldNudge} aria-hidden="true">
            <span className={styles.nameFieldCursor} />
            <span className={styles.nameFieldHint}>이 식물의 이름은 무엇인가요?</span>
          </span>
        ) : null}
        <input
          ref={inputRef}
          className={styles.nameInput}
          type="text"
          name="plantName"
          value={plantName}
          placeholder=""
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          maxLength={24}
          aria-label="식물 이름"
          onChange={(event) => onPlantNameChange?.(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
        />
        {plantName.trim() && !exiting ? (
          <button
            type="button"
            className={styles.nameSubmit}
            aria-label="이름 확정하고 다음으로"
            onClick={submit}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path
                d="M5 12h13M13 6l6 6-6 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}
      </label>
      <form
        className={styles.srForm}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <button type="submit" tabIndex={-1} aria-hidden="true">
          확인
        </button>
      </form>
    </div>
  );
}
