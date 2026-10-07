import styles from './MobileStatusBar.module.css';

/** Figma 1690:708 / 1690:709 — Status bar - iPhone (time 9:41 + levels) */
export default function MobileStatusBar({ time = '9:41' }) {
  return (
    <div className={styles.bar} data-figma-node="1690:708">
      <div className={styles.inner} data-figma-node="1690:709">
        <div className={styles.timeArea}>
          <time className={styles.time} dateTime={time.replace('.', ':')}>
            {time}
          </time>
        </div>
        <div className={styles.levels} aria-hidden="true">
          <svg className={styles.icon} viewBox="0 0 25 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              fill="currentColor"
              d="M0 14.5h2.5V9H0v5.5Zm4.5 0H7V6.5H4.5V14.5Zm4.5 0H12V4H9v10.5Zm4.5 0H16.5V2H14v12.5Zm4.5 0H21V0h-2.5v14.5Z"
            />
          </svg>
          <svg className={styles.icon} viewBox="0 0 22 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              fill="currentColor"
              d="M11 3.2c2.4 0 4.6.9 6.3 2.4l1.8-1.8C16.2 1.4 13.7.4 11 .4S5.8 1.4 3.9 3.8l1.8 1.8C7.4 4.1 9.6 3.2 11 3.2Zm0 4.8c1.3 0 2.5.5 3.4 1.3l1.8-1.8c-1.4-1.3-3.2-2-5.2-2s-3.8.7-5.2 2l1.8 1.8c.9-.8 2.1-1.3 3.4-1.3Zm0 4.8c.7 0 1.3.2 1.8.7l1.8-1.8c-1-.9-2.3-1.4-3.6-1.4s-2.6.5-3.6 1.4l1.8 1.8c.5-.5 1.1-.7 1.8-.7Zm0 2.4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
            />
          </svg>
          <svg className={styles.battery} viewBox="0 0 36 17" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1.5" width="30" height="14" rx="3" stroke="currentColor" strokeWidth="1.2" />
            <rect x="32.5" y="5.5" width="2.5" height="6" rx="1" fill="currentColor" />
            <rect x="3.5" y="4" width="22" height="9" rx="1.5" fill="currentColor" />
          </svg>
        </div>
      </div>
    </div>
  );
}
