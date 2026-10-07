import styles from './LocationTag.module.css';

export default function LocationTag({ x, y, label = '선택됨' }) {
  return (
    <div
      className={styles.tag}
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
      }}
    >
      <span className={styles.icon}>🌱</span>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
