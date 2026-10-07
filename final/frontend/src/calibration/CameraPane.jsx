import { useEffect, useRef } from 'react';
import styles from './CameraPane.module.css';

/**
 * 참가자 한 명의 카메라 선택 + 미리보기 + 랜드마크 오버레이 + 상태.
 *
 * 추적용 비디오는 페이지 밖에 있으므로, 미리보기는 같은 스트림을 자기 비디오에 붙여서 쓴다.
 * 하나의 MediaStream 은 여러 비디오 엘리먼트에 동시에 연결할 수 있다.
 */
export default function CameraPane({
  label,
  color,
  deviceId,
  devices,
  onChange,
  onFocus,
  stream,
  canvasRef,
  stats,
  calibrated = false,
  optional = false,
}) {
  const videoRef = useRef(null);
  const off = optional && !deviceId;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.srcObject !== stream) {
      video.srcObject = stream || null;
    }
    if (stream) {
      video.play().catch(() => {});
    }
  }, [stream]);

  return (
    <div className={`${styles.pane} ${off ? styles.paneOff : ''}`}>
      <div className={styles.bar}>
        <span className={styles.label} style={{ color: off ? undefined : color }}>
          {label}
        </span>
        <span className={`${styles.state} ${stats.face ? styles.ok : styles.warn}`}>
          {off ? '미사용' : `${stats.fps.toFixed(0)}fps · ${stats.face ? '검출' : '없음'}`}
        </span>
      </div>

      <div className={styles.preview}>
        <video ref={videoRef} playsInline muted />
        <canvas ref={canvasRef} />
        {off && <div className={styles.previewEmpty}>미사용</div>}
      </div>

      <select
        className={styles.select}
        value={deviceId}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
      >
        {optional ? (
          <option value="">사용 안 함</option>
        ) : (
          <option value="">기본 카메라</option>
        )}
        {devices.map((device, i) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `카메라 ${i + 1}`}
          </option>
        ))}
      </select>

      <p className={`${styles.calib} ${calibrated ? styles.calibOk : ''}`}>
        {calibrated ? '● 보정 완료' : '○ 보정 필요'}
      </p>
    </div>
  );
}
