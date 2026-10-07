import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';
import { useSpeechInput } from '../src/f2/useSpeechInput';
import { MIC_SOURCE, piMicSupported } from '../src/shared/piMic/piMicStream';

// 마이크 점검용. /2 와 같은 훅으로 듣고, 음량과 인식된 문장을 그대로 보여 준다.
export default function PiMicTestPage() {
  const userId = 1;
  const speech = useSpeechInput({ userId });
  const [level, setLevel] = useState(0);
  const [supported, setSupported] = useState(false);
  const speechRef = useRef(speech);
  speechRef.current = speech;

  useEffect(() => {
    setSupported(piMicSupported());
    const timer = window.setInterval(() => setLevel(speechRef.current.levelRef.current), 100);
    return () => window.clearInterval(timer);
  }, []);


  return (
    <>
      <Head>
        <title>마이크 테스트</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main style={{ padding: 32, fontFamily: 'system-ui', lineHeight: 1.6 }}>
        <h1 style={{ fontSize: 20 }}>{userId}P 마이크 테스트</h1>
        <p><a href="/hardware">장비 점검으로 돌아가기</a></p>
        <button onClick={speech.startListening}>듣기 시작</button>{' '}
        <button onClick={speech.stopListening}>중지</button>
        <p>
          설정: <b>{MIC_SOURCE === 'pi' ? '라즈베리파이 마이크' : '맥 마이크'}</b>
          {MIC_SOURCE === 'pi' && !supported ? ' (이 Chrome 은 135 미만이라 맥 마이크로 대체됨)' : ''}
          {' · '}
          {speech.isListening ? '듣는 중' : '멈춤'}
          {speech.error ? ` · 오류: ${speech.error}` : ''}
        </p>
        <div style={{ width: 320, height: 12, background: '#ddd', borderRadius: 6 }}>
          <div
            data-testid="level"
            style={{ width: `${Math.round(level * 100)}%`, height: '100%', background: '#2a7', borderRadius: 6 }}
          />
        </div>
        <p data-testid="transcript">{speech.transcript}</p>
        <p data-testid="interim" style={{ color: '#888' }}>
          {speech.interimTranscript}
        </p>
        <p style={{ color: '#888', fontSize: 13 }}>
          Pi 마이크를 못 쓰면 맥 마이크로 넘어가고, 그 이유가 개발자 도구 콘솔에 [mic] 으로 남습니다.
        </p>
      </main>
    </>
  );
}
