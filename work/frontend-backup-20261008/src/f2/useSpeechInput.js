import { useCallback, useEffect, useRef, useState } from 'react';
import { MIC_SOURCE, acquirePiMic, piMicSupported } from '../shared/piMic/piMicStream';

export function useSpeechInput({ onFinalTranscript, onTranscriptUpdate, userId = 1 } = {}) {
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const shouldListenRef = useRef(false);
  const onFinalRef = useRef(onFinalTranscript);
  const onUpdateRef = useRef(onTranscriptUpdate);
  const transcriptRef = useRef('');
  const interimRef = useRef('');
  const isListeningRef = useRef(false);
  const levelRef = useRef(0);
  const meterRef = useRef(null);
  const meterGenRef = useRef(0);
  // NEXT_PUBLIC_MIC_SOURCE=pi 일 때 라즈베리파이 마이크 스트림. 못 받으면 null 인 채로 맥 마이크를 쓴다.
  const piRef = useRef(null);
  const piGenRef = useRef(0);

  const releasePi = useCallback(() => {
    piGenRef.current += 1;
    const pi = piRef.current;
    piRef.current = null;
    pi?.release();
  }, []);

  // Pi 스트림이 있으면 그 소리로, 없으면 지금까지처럼 기본 마이크로 인식한다.
  const startRecognition = useCallback((recognition) => {
    const track = piRef.current?.stream.getAudioTracks()[0];
    if (!track) {
      recognition.start();
      return;
    }
    try {
      recognition.start(track);
    } catch (err) {
      if (err?.name !== 'InvalidStateError' || track.readyState === 'live') throw err;
      // Pi 연결이 끊겨 트랙이 죽었다. 맥 마이크로 넘어간다.
      console.warn('[mic] Pi 마이크가 끊겨 맥 마이크로 전환');
      releasePi();
      recognition.start();
    }
  }, [releasePi]);
  const stopMeter = useCallback(() => {
    meterGenRef.current += 1;
    const meter = meterRef.current;
    meterRef.current = null;
    levelRef.current = 0;
    if (!meter) return;
    window.cancelAnimationFrame(meter.frame);
    if (meter.ownsStream) meter.stream.getTracks().forEach((track) => track.stop());
    meter.ctx.close();
  }, []);

  const startMeter = useCallback(async () => {
    if (meterRef.current || typeof navigator === 'undefined' || !navigator.mediaDevices) return;
    const gen = meterGenRef.current + 1;
    meterGenRef.current = gen;
    try {
      const piStream = piRef.current?.stream;
      const stream =
        piStream ||
        (await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        }));
      if (meterGenRef.current !== gen || !shouldListenRef.current) {
        if (!piStream) stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      void ctx.resume();
      const data = new Uint8Array(analyser.fftSize);
      const meter = { stream, ctx, frame: 0, ownsStream: !piStream };
      meterRef.current = meter;
      const tick = () => {
        if (meterRef.current !== meter) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const sample = (data[i] - 128) / 128;
          sum += sample * sample;
        }
        const rms = Math.sqrt(sum / data.length);
        const next = Math.min(1, Math.max(0, (rms - 0.008) / 0.05));
        const prev = levelRef.current;
        levelRef.current = prev + (next - prev) * (next > prev ? 0.62 : 0.16);
        meter.frame = window.requestAnimationFrame(tick);
      };
      meter.frame = window.requestAnimationFrame(tick);
    } catch {
      levelRef.current = 0;
    }
  }, []);

  useEffect(() => {
    onFinalRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    onUpdateRef.current = onTranscriptUpdate;
  }, [onTranscriptUpdate]);

  const emitTranscriptUpdate = useCallback(() => {
    const combined = `${transcriptRef.current} ${interimRef.current}`.trim();
    onUpdateRef.current?.(combined, transcriptRef.current, interimRef.current);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return undefined;
    }

    setIsSupported(true);
    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      if (finalText) {
        transcriptRef.current = `${transcriptRef.current}${finalText}`.trim();
        setTranscript(transcriptRef.current);
        onFinalRef.current?.(transcriptRef.current, finalText.trim());
      }

      interimRef.current = interimText;
      setInterimTranscript(interimText);
      emitTranscriptUpdate();
    };

    recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setError(event.error);
      }
    };

    recognition.onend = () => {
      if (shouldListenRef.current && recognitionRef.current) {
        window.setTimeout(() => {
          if (!shouldListenRef.current || !recognitionRef.current) return;
          try {
            startRecognition(recognitionRef.current);
            isListeningRef.current = true;
            setIsListening(true);
          } catch {
            isListeningRef.current = false;
            setIsListening(false);
          }
        }, 180);
        return;
      }
      setIsListening(false);
      isListeningRef.current = false;
    };

    recognitionRef.current = recognition;

    return () => {
      shouldListenRef.current = false;
      recognition.stop();
      stopMeter();
      releasePi();
    };
  }, [emitTranscriptUpdate, releasePi, startRecognition, stopMeter]);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    recognitionRef.current?.stop();
    isListeningRef.current = false;
    setIsListening(false);
    stopMeter();
    releasePi();
  }, [releasePi, stopMeter]);

  // A participant change must release the previous participant's audio track.
  useEffect(() => { stopListening(); }, [userId, stopListening]);

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return false;
    setError(null);
    shouldListenRef.current = true;

    const tryStart = (attempt = 0) => {
      try {
        startRecognition(recognition);
        isListeningRef.current = true;
        setIsListening(true);
        return true;
      } catch {
        if (attempt >= 6) {
          isListeningRef.current = false;
          setIsListening(false);
          return false;
        }
        window.setTimeout(() => tryStart(attempt + 1), 200 * (attempt + 1));
        return false;
      }
    };

    if (MIC_SOURCE === 'pi' && !piRef.current) {
      if (!piMicSupported()) {
        console.warn('[mic] 이 Chrome 은 Pi 마이크 인식(135 이상 필요)을 못 해서 맥 마이크를 씁니다');
      } else {
        // Pi 소리가 들어오는 것을 확인한 뒤 인식을 시작한다. 못 받으면 맥 마이크로 그대로 진행한다.
        const gen = piGenRef.current + 1;
        piGenRef.current = gen;
        acquirePiMic(userId)
          .then((pi) => {
            if (piGenRef.current !== gen || !shouldListenRef.current) {
              pi.release();
              return;
            }
            piRef.current = pi;
            void pi.lost.then(() => {
              if (piRef.current !== pi) return;
              // 듣는 도중 Pi 가 끊겼다. 남은 시간은 맥 마이크로 이어 듣는다.
              console.warn('[mic] Pi 마이크가 끊겨 맥 마이크로 전환');
              releasePi();
              stopMeter();
              if (!shouldListenRef.current) return;
              startMeter();
              recognitionRef.current?.stop();
            });
          })
          .catch((err) => {
            if (piGenRef.current === gen) console.warn(`[mic] Pi 마이크를 못 써서 맥 마이크로 전환: ${err.message}`);
          })
          .finally(() => {
            if (piGenRef.current !== gen || !shouldListenRef.current) return;
            startMeter();
            tryStart();
          });
        return true;
      }
    }

    startMeter();
    return tryStart();
  }, [releasePi, startMeter, startRecognition, stopMeter, userId]);

  const getIsListening = useCallback(() => isListeningRef.current, []);

  const clearTranscript = useCallback(() => {
    transcriptRef.current = '';
    interimRef.current = '';
    setTranscript('');
    setInterimTranscript('');
    emitTranscriptUpdate();
  }, [emitTranscriptUpdate]);

  const setManualText = useCallback(
    (text) => {
      transcriptRef.current = text;
      interimRef.current = '';
      setTranscript(text);
      setInterimTranscript('');
      emitTranscriptUpdate();
    },
    [emitTranscriptUpdate]
  );

  const getCombinedText = useCallback(() => {
    return `${transcriptRef.current} ${interimRef.current}`.trim();
  }, []);

  return {
    transcript,
    interimTranscript,
    isListening,
    isSupported,
    error,
    startListening,
    stopListening,
    clearTranscript,
    setManualText,
    getCombinedText,
    getIsListening,
    levelRef,
  };
}
