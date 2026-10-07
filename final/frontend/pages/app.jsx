import { useEffect } from 'react';
import CalibrationOverlay from '../src/calibration/CalibrationOverlay';
import { useEntryFlow } from '../src/shared/EntryFlowContext';

export default function EntryPage() {
  const engine = useEntryFlow();
  useEffect(() => {
    const key = event => {
      if (event.key === 'Escape') engine.cancelCalibration();
      if (event.code === 'Space' && engine.calibUi && !engine.calibUi.ready) {
        event.preventDefault(); engine.startStage();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [engine.cancelCalibration, engine.startStage, engine.calibUi]);
  return <main style={{ padding: 32, fontFamily: 'system-ui', lineHeight: 1.7 }}>
    <h1>운영자 시선 보정</h1>
    <p>작품과 같은 창 크기·착용 상태에서 9점 보정과 3점 검증을 진행하세요. 전체 화면은 보정 전에 켜 주세요.</p>
    <button onClick={() => document.documentElement.requestFullscreen?.()}>전체 화면</button>{' '}
    <button onClick={() => engine.beginCalibration()}>1P 시선 보정</button>{' '}
    <button onClick={engine.resetCalibration}>모든 보정 초기화</button>
    <p role="status">{engine.status}</p>
    {engine.error && <p role="alert">{engine.error}</p>}
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      {['A'].map((cam, i) => <section key={cam} style={{ width: 320 }}>
        <h2>{i + 1}P · {cam === 'A' ? 'NABI' : 'SORA'}</h2>
        <canvas ref={engine.canvasRefs[cam]} style={{ width: '100%', aspectRatio: '4 / 3', background: '#152019' }} />
        <p>{engine.stats[cam].face ? '동공 검출' : '눈 위치/연결 확인'} · {engine.stats[cam].fps.toFixed(1)} FPS · {engine.calibrated.includes(cam) ? '보정 완료' : '보정 필요'}</p>
        <button onClick={() => engine.beginCalibration('calibrate', cam)}>{i + 1}P만 보정</button>
      </section>)}
    </div>
    <p>2P · SORA는 전시 안내 시나리오로 진행하며 카메라·IMU·마이크를 사용하지 않습니다.</p>
    <p><a href="/hardware">장비 점검</a> · <a href="/pre_opening" onClick={engine.completeSetup}>관람객 화면으로 이동</a></p>
    {engine.calibUi && <CalibrationOverlay {...engine.calibUi} onStart={engine.startStage} />}
  </main>;
}
