import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { DEV_MOBILE_INPUT_EVENT, isDevAssistEnabled } from '../shared/dev/devEvents';
import { MOBILE_PHASE } from './mobilePhases';

/** ?dev=1 또는 development — 상단 DEV 모달 → 모바일 이름 입력 대체 */
export function useDevMobileInput({ phase, setPlantName, onConfirmName }) {
  const router = useRouter();
  const enabled = router.isReady && router.pathname === '/mobile' && isDevAssistEnabled(router.query);

  useEffect(() => {
    if (!enabled) return undefined;

    const onMessage = (event) => {
      const text = typeof event.detail?.text === 'string' ? event.detail.text : '';
      if (text) setPlantName(text);
      if (event.detail?.submit && phase === MOBILE_PHASE.TAG2) {
        const trimmed = text.trim();
        if (trimmed) onConfirmName?.(trimmed);
      }
    };

    window.addEventListener(DEV_MOBILE_INPUT_EVENT, onMessage);
    return () => window.removeEventListener(DEV_MOBILE_INPUT_EVENT, onMessage);
  }, [enabled, phase, setPlantName, onConfirmName]);
}
