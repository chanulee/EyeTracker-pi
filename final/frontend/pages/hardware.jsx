import { useEffect, useState } from 'react';
import Head from 'next/head';

export default function HardwarePage() {
  const [hardware, setHardware] = useState(null);
  const [gaze, setGaze] = useState({});
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    const json = async path => {
      const response = await fetch(path, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    };
    const poll = async () => {
      try {
        const [h, player] = await Promise.all([json('/api/hardware'), json('/api/players/1/status').catch(() => null)]);
        if (!controller.signal.aborted) { setHardware(h); setGaze({ 1: player }); }
      } catch { if (!controller.signal.aborted) setHardware(null); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 500);
    };
    poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);
  return <main style={{ maxWidth: 1000, margin: '40px auto', padding: 24, fontFamily: 'system-ui', lineHeight: 1.7 }}>
    <Head><title>전시 장비 점검</title></Head>
    <h1>전시 장비 점검</h1>
    <p><a href="/pre_opening">작품 시작</a> · <a href="/app">시선 보정</a> · <a href="http://localhost:8080/admin">시선 관리자 / Pi 연결 토큰</a></p>
    <p>1P = NABI: 카메라 1대 + IMU + 마이크. 2P = SORA: 장치를 사용하지 않는 안내 시나리오. 거리 화면은 1P 차례에만 IMU로 움직입니다.</p>
    {!hardware && <p role="alert">장비 서버 연결을 확인하세요. 이 Mac의 localhost:3000에서 열어 주세요.</p>}
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      {[1].map(id => {
        const p = hardware?.players[id - 1], s = p?.sensors, g = gaze[id];
        const imu = s?.connected && s.imu?.status === 'ok' && s.imu.age < .75;
        return <section key={id} style={{ flex: 1, minWidth: 300, background: '#f2f4f2', color: '#17241c', borderRadius: 12, padding: 24 }}>
          <h2>{id}P · {id === 1 ? 'NABI' : 'SORA'} {g?.simulate || s?.mock ? '(모의 입력)' : ''}</h2>
          <p>눈 카메라: {g?.camera_connected ? '연결됨' : '연결 대기'}<br />
            동공: {g?.pupil_detected ? '검출됨' : '미검출'} · {g?.processing_fps || 0} FPS<br />
            보정: {g?.calibrated ? '완료' : '필요'}<br />
            IMU: {imu ? '정상' : s?.imu?.msg || '연결 대기'}<br />
            마이크 센서: {s?.connected && s.mic?.status === 'ok' && s.mic.age < 1 ? `${s.mic.rms_db} dBFS` : '연결 대기'}<br />
            음성 중계: {p?.mic.connected ? '전송 중' : '듣기 요청 대기 / 미연결'}</p>
          <a href={`/pi_mic_test?user_id=${id}`}>{id}P 음성 인식 점검</a>
          <details><summary>원시 센서 값</summary><pre style={{ overflow: 'auto', fontSize: 12 }}>{JSON.stringify(s, null, 2)}</pre></details>
        </section>;
      })}
    </div>
    <p>관람객 교체 또는 눈 카메라 재연결 후 다시 보정하세요. 실제 눈 정확도와 IMU 장착 방향은 장비를 착용한 상태에서 확인해야 합니다.</p>
  </main>;
}
