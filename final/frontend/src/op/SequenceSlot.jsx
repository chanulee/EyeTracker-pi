import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './OpeningStill.module.css';

/**
 * 새로 만들 시퀀스 영상 자리. src 파일이 없으면 durationMs 동안 검은 슬롯만 둔다.
 * 이 클립만 소리를 켠다. 기존 3초 영상은 그대로 음소거다.
 */
export default function SequenceSlot({ src, durationMs, onEnded, cueEnd = false }) {
  const videoRef = useRef(null);
  const finishedRef = useRef(false);
  const [failed, setFailed] = useState(!src);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onEnded?.();
  }, [onEnded]);

  useEffect(() => {
    finishedRef.current = false;
    setFailed(!src);
    const timer = window.setTimeout(finish, durationMs);
    return () => window.clearTimeout(timer);
  }, [src, durationMs, finish]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || failed) return undefined;
    video.muted = false;
    video.defaultMuted = false;
    video.volume = 1;
    const pending = video.play();
    if (pending) pending.catch(() => {});
    return () => {
      video.pause();
    };
  }, [src, failed]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !cueEnd) return undefined;
    const jump = () => {
      const duration = video.duration;
      if (!duration || !Number.isFinite(duration)) return;
      video.currentTime = Math.max(0, duration - 2.4);
      const pending = video.play();
      if (pending) pending.catch(() => {});
    };
    if (video.readyState >= 1) jump();
    video.addEventListener('loadedmetadata', jump);
    return () => video.removeEventListener('loadedmetadata', jump);
  }, [cueEnd]);

  return (
    <div className={styles.sequenceSlot} aria-label="Opening sequence slot" data-sequence-ready={src && !failed ? '1' : '0'}>
      {src && !failed ? (
        <video
          ref={videoRef}
          className={styles.sequenceVideo}
          src={src}
          playsInline
          autoPlay
          preload="auto"
          onEnded={finish}
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}
