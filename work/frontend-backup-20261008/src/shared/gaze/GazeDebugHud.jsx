import { useEffect, useRef, useState } from 'react';
import { CAM_COLOR, CAM_KEYS, PERSON_LABEL, VIEWER_BY_CAM } from './participants';
import styles from './GazeDebugHud.module.css';

const STATE_LABEL = {
  idle: '대기',
  calibrating: '보정 중',
  'no-camera': '카메라 없음',
  'no-model': '보정 안 됨',
  tracking: '추적 중',
  holding: '유지 (깜빡임/순간 유실)',
  lost: '놓침',
  'invalid-model': '모델 발산 (보정 실패)',
};

const OK_STATES = new Set(['tracking', 'holding']);

/**
 * 커서가 끊기는 원인을 화면에서 바로 확인하는 진단 패널. `D` 키로 켜고 끈다.
 *
 * 값은 매 프레임 바뀌지만 사람이 읽는 속도면 충분하므로 5fps 로만 state 에 올린다.
 */
export default function GazeDebugHud({ diagRef, gazeRef }) {
  const [visible, setVisible] = useState(false);
  const [rows, setRows] = useState(null);
  const lastAtRef = useRef(0);

  useEffect(() => {
    const onKey = (event) => {
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') return;
      if (event.key === 'd' || event.key === 'D' || event.key === 'ㅇ') {
        setVisible((current) => !current);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!visible) return;

    let rafId;
    const loop = () => {
      rafId = requestAnimationFrame(loop);

      const now = performance.now();
      if (now - lastAtRef.current < 200) return;
      lastAtRef.current = now;

      setRows(
        (process.env.NEXT_PUBLIC_GAZE_SOURCE === 'pi' ? ['A'] : CAM_KEYS).map((key) => {
          const diag = diagRef.current?.[key] || {};
          const gaze = gazeRef.current?.[VIEWER_BY_CAM[key]];
          return { key, ...diag, hasGaze: Boolean(gaze) };
        })
      );
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [visible, diagRef, gazeRef]);

  if (!visible || !rows) return null;

  return (
    <div className={styles.hud}>
      <div className={styles.head}>
        시선 진단 <span className={styles.dim}>D 키로 닫기</span>
      </div>

      {rows.map((row) => (
        <div key={row.key} className={styles.row}>
          <div className={styles.name} style={{ color: CAM_COLOR[row.key] }}>
            {PERSON_LABEL[row.key]}
          </div>

          <div className={`${styles.state} ${OK_STATES.has(row.state) ? styles.ok : styles.bad}`}>
            {STATE_LABEL[row.state] || row.state}
          </div>

          <dl className={styles.grid}>
            <dt>fps</dt>
            <dd>{row.fps.toFixed(0)}</dd>
            <dt>얼굴</dt>
            <dd className={row.face ? styles.ok : styles.bad}>{row.face ? '검출' : '없음'}</dd>
            <dt>깜빡임</dt>
            <dd className={row.blinking ? styles.bad : ''}>{row.blinking ? '감김' : '열림'}</dd>
            <dt>프레임 지연</dt>
            <dd className={row.stale ? styles.bad : ''}>{row.stale ? '오래됨' : '정상'}</dd>
            <dt>보정</dt>
            <dd className={row.hasModel ? styles.ok : styles.bad}>
              {row.hasModel ? '완료' : '없음'}
            </dd>
            <dt>예측 좌표</dt>
            <dd>
              {row.nx.toFixed(2)}, {row.ny.toFixed(2)}
            </dd>
            <dt>특징 이탈</dt>
            <dd className={row.deviation > 4 ? styles.bad : ''}>
              {row.deviation.toFixed(1)}σ
            </dd>
            <dt>발산 횟수</dt>
            <dd className={row.invalid > 0 ? styles.bad : ''}>{row.invalid}</dd>
            <dt>커서</dt>
            <dd className={row.hasGaze ? styles.ok : styles.bad}>
              {row.hasGaze ? '표시' : '숨김'}
            </dd>
          </dl>
        </div>
      ))}

      <p className={styles.note}>
        예측 좌표는 화면 비율(0~1)입니다. 특징 이탈이 4σ를 넘으면 지금 자세가 보정 때와 달라진
        것이니, 그 자세로 다시 보정하세요.
      </p>
    </div>
  );
}
