import { useEffect, useRef } from 'react';

/** visualViewport 높이가 layout 대비 이만큼 줄면 소프트 키보드로 본다 */
const KEYBOARD_HEIGHT_DELTA_PX = 80;

function isSoftKeyboardOpen() {
  if (typeof window === 'undefined') return false;
  const vv = window.visualViewport;
  if (!vv) return false;
  // iOS Safari 는 주소창 때문에 innerHeight 와 visualViewport.height 차이가
  // 항상 크게 난다. 이를 키보드로 오판하면 레이아웃 높이 보정이 통째로 스킵돼
  // 화면 아래가 잘린다. 실제 텍스트 입력에 포커스가 있을 때만 키보드로 본다.
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  const tag = active?.tagName;
  const editing =
    tag === 'INPUT' || tag === 'TEXTAREA' || active?.isContentEditable === true;
  if (!editing) return false;
  return window.innerHeight - vv.height > KEYBOARD_HEIGHT_DELTA_PX;
}

/**
 * .safe 높이는 layout viewport 기준. 키보드는 UI 위에 겹치고, 셸·스케일은 줄이지 않는다.
 * @param {React.RefObject<HTMLElement>} rootRef — .safe
 */
export function useMobileViewportLayout(rootRef) {
  const lockedLayoutHeightRef = useRef(0);

  useEffect(() => {
    const apply = () => {
      const el = rootRef.current;
      if (!el || typeof window === 'undefined') return;

      if (isSoftKeyboardOpen()) {
        if (lockedLayoutHeightRef.current > 0) {
          el.style.height = `${lockedLayoutHeightRef.current}px`;
        }
        return;
      }

      // iOS Safari: window.innerHeight/CSS dvh 는 주소창 유무에 따라 실제 보이는
      // 영역보다 크게 잡혀 하단이 잘리거나 스케일이 어긋난다. 실제 가시 높이인
      // visualViewport.height 를 우선 사용해 "보이는 만큼"에 정확히 맞춘다.
      const vv = window.visualViewport;
      const visibleH = Math.round(vv?.height ?? window.innerHeight);
      if (!visibleH) return;
      lockedLayoutHeightRef.current = visibleH;
      el.style.height = `${visibleH}px`;
    };

    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', apply);

    return () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
      vv?.removeEventListener('resize', apply);
      rootRef.current?.style.removeProperty('height');
    };
  }, [rootRef]);
}
