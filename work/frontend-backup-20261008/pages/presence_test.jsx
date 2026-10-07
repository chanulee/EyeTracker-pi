import Head from 'next/head';
import PresenceTest from '../src/presenceTest';

export default function PresenceTestPage() {
  return (
    <>
      <Head>
        <title>인원 인식 테스트</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <PresenceTest />
    </>
  );
}
