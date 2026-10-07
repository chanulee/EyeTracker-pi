import { useCallback, useEffect, useState } from 'react';
import { computeMobileStageScale } from './mobileStageFit';

/** visualViewport 높이가 layout 대비 이만큼 줄면 소프트 키보드로 본다 */
const KEYBOARD_HEIGHT_DELTA_PX = 80;

function isSoftKeyboardOpen() {
  if (typeof window === 'undefined') return false;
  const vv = window.visualViewport;
  if (!vv) return false;
  // iOS Safari 주소창으로 인한 innerHeight/visualViewport 차이를 키보드로
  // 오판하지 않도록, 실제 입력 포커스가 있을 때만 키보드로 판정한다.
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  const tag = active?.tagName;
  const editing =
    tag === 'INPUT' || tag === 'TEXTAREA' || active?.isContentEditable === true;
  if (!editing) return false;
  return window.innerHeight - vv.height > KEYBOARD_HEIGHT_DELTA_PX;
}

/**
 * Figma 아트보드를 현재 보이는 뷰포트에 맞춰 scale.
 * - mobile: 세로 여유 있으면 가로 꽉(sx), 부족하면 sy로 전체 수납(하단 버튼 안 잘림)
 * - width: 가로만 맞춤(세로 크롭)
 * - contain | cover
 */
export function useMobileStageScale(viewportRef, artboardWidth, artboardHeight, fit = 'contain') {
  const [scale, setScale] = useState(1);

  const measure = useCallback(() => {
    if (isSoftKeyboardOpen()) return;

    const box = viewportRef.current;
    if (!box) return;

    // 높이는 .safe 인라인 높이 반영 타이밍에 의존하지 않도록 실제 가시 영역을 직접 사용.
    const vv = window.visualViewport;
    const w = box.clientWidth;
    const h = Math.round(vv?.height ?? box.clientHeight);
    if (!w || !h) return;

    const next = computeMobileStageScale(w, h, artboardWidth, artboardHeight, fit);
    setScale(next > 0 ? next : 1);
  }, [viewportRef, artboardWidth, artboardHeight, fit]);

  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    const box = viewportRef.current;
    if (box) observer.observe(box);

    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      vv?.removeEventListener('resize', measure);
    };
  }, [measure, viewportRef]);

  return scale;
}
