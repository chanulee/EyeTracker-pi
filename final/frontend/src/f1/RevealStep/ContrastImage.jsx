import { ENV_OVERLAY_TEXT, STREET_IMAGE } from '../../shared/gazeConfig';
import styles from './ContrastImage.module.css';

export default function ContrastImage({ visible }) {
  return (
    <div className={`${styles.wrapper} ${visible ? styles.visible : ''}`}>
      <div className={styles.imageFrame}>
        <img src={STREET_IMAGE} alt="지금의 서울 거리" className={styles.image} draggable={false} />
        <div className={styles.overlay}>{ENV_OVERLAY_TEXT}</div>
      </div>
    </div>
  );
}
