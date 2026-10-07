import Head from 'next/head';
import FailScreen from '../src/fail';

export default function FailPage() {
  return (
    <>
      <Head>
        <title>Plant Your Seoul — 모바일 인식</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </Head>
      <FailScreen />
    </>
  );
}
