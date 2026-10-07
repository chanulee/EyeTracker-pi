import { CAM_KEYS } from './participants';
import styles from './GazeCameraFeeds.module.css';

/**
 * 시선 추적이 프레임을 읽어가는 비디오 엘리먼트.
 *
 * 페이지 안에 두면 화면을 넘길 때 엘리먼트가 사라져 추적이 끊기므로, 페이지 밖의
 * Provider 에서 한 번만 그려 계속 살려 둔다. 보정 화면의 미리보기는 같은 스트림을
 * 자기 비디오에 따로 붙여서 쓴다.
 *
 * 화면에서는 감추지만 display:none 으로 없애면 브라우저가 프레임 갱신을 멈출 수 있어
 * 1px 크기로 남겨 둔다. CSS 크기는 프레임 해상도에 영향을 주지 않는다.
 */
export default function GazeCameraFeeds({ videoRefs }) {
  return (
    <div className={styles.feeds} aria-hidden="true">
      {CAM_KEYS.map((key) => (
        <video key={key} ref={videoRefs[key]} playsInline muted />
      ))}
    </div>
  );
}
