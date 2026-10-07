import { useEffect } from 'react';
import Head from 'next/head';
import { RECOVERY_HOME, clearFlowState, noteRecoveryAndGetDelay } from '../src/shared/flowRecovery';

/**
 * /6 — 보이지 않는 전체 복구 페이지.
 *
 * 흐름 도중 오류가 감지되면(src/shared/flowRecovery.js) 여기로 온다.
 * 운영자가 새로고침 버튼을 누르는 것과 같은 일을 자동으로 한다:
 *   1) 이 탭에 남은 진행 상태(sessionStorage)를 지우고
 *   2) 전체를 하드 리로드해 /pre_opening 부터 다시 시작한다.
 * 짧은 시간에 반복되면(리로드 루프) 잠시 기다렸다가 다시 시작한다.
 * 직접 /6 을 열어도 같은 동작을 하므로, 손으로 전체를 리셋할 때도 쓸 수 있다.
 */
export default function RecoveryPage() {
  useEffect(() => {
    const delay = noteRecoveryAndGetDelay();
    const timer = window.setTimeout(() => {
      clearFlowState();
      // location.replace 는 Next 라우터를 거치지 않는 전체 페이지 교체라, 시선 엔진·웹소켓·영상 등
      // 모든 상태가 처음부터 다시 만들어진다. /6 은 뒤로가기 기록에도 남지 않는다.
      window.location.replace(RECOVERY_HOME);
    }, delay);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <Head>
        <title>Plant Your Seoul</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div style={{ position: 'fixed', inset: 0, background: '#000' }} aria-hidden="true" />
    </>
  );
}
