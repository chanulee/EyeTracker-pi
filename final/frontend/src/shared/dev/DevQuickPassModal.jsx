import { useCallback, useState } from 'react';
import { useRouter } from 'next/router';
import { useEntryFlow } from '../EntryFlowContext';
import {
  emitDevMobileInput,
  emitDevPassGaze,
  emitDevVoice,
  isDevAssistEnabled,
} from './devEvents';
import styles from './DevQuickPassModal.module.css';

function DevQuickPassPanel({ pathname }) {
  const { discussionCam } = useEntryFlow();
  const [text, setText] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const onKiosk = pathname === '/2';
  const onMobile = pathname === '/mobile';
  const viewer = discussionCam === 'B' ? 'B' : 'A';

  const applyInput = useCallback(() => {
    if (onMobile) {
      emitDevMobileInput({ text, submit: false });
      return;
    }
    if (onKiosk) {
      emitDevVoice({ text, viewer, submit: false });
    }
  }, [onKiosk, onMobile, text, viewer]);

  const applyPass = useCallback(() => {
    const fallback = text.trim() || '개발 패스';
    if (onMobile) {
      emitDevMobileInput({ text: fallback, submit: true });
      return;
    }
    if (onKiosk) {
      emitDevPassGaze();
      emitDevVoice({ text: fallback, viewer, submit: true });
    }
  }, [onKiosk, onMobile, text, viewer]);

  return (
    <div className={`${styles.shell} ${collapsed ? styles.shellCollapsed : ''}`} data-dev-assist>
      <div className={styles.bar}>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
        >
          DEV
        </button>
        {!collapsed ? (
          <>
            <input
              className={styles.input}
              type="text"
              value={text}
              placeholder={onMobile ? '식물 이름 등' : '음성·패스 텍스트'}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyPass();
              }}
            />
            <button type="button" className={styles.btn} onClick={applyInput}>
              입력
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={applyPass}>
              패스
            </button>
            {onKiosk ? <span className={styles.hint}>차례 {viewer}</span> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

/** development 또는 ?dev=1 — /2·/mobile 전용 */
export default function DevQuickPassModal() {
  const router = useRouter();

  if (!router.isReady) return null;
  if (!isDevAssistEnabled(router.query)) return null;
  if (router.pathname !== '/2' && router.pathname !== '/mobile') return null;

  return <DevQuickPassPanel pathname={router.pathname} />;
}
