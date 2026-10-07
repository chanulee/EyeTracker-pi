import Head from 'next/head';
import { useRouter } from 'next/router';
import DreamyBackground from './DreamyBackground';
import { useEntryFlow } from './EntryFlowContext';
import styles from './EntryPageShell.module.css';

export default function EntryPageShell({ title, showReticle = true, children }) {
  const router = useRouter();
  const { isReady, error } = useEntryFlow();
  const showFooter = router.pathname !== '/2';

  return (
    <>
      <Head>
        <title>{`${title} · Visual AI Glass`}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="시선 기반 서울 거리 토론 프로토타입" />
      </Head>

      <div className={styles.root}>
        {router.pathname !== '/2' && <DreamyBackground />}

        {!isReady && !error && (
          <div className={styles.loading}>
            <p>시선 추적 초기화 중…</p>
            <p className={styles.loadingSub}>카메라 권한을 허용해 주세요</p>
          </div>
        )}

        {error && (
          <div className={styles.error}>
            <p>시선 추적 오류: {error}</p>
          </div>
        )}

        {children}

        {showFooter && (
          <footer className={styles.footer}>Visual AI Glass · Scene 2–3 Prototype</footer>
        )}
      </div>
    </>
  );
}
