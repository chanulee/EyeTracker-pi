import Head from 'next/head';
import EndingPage from '../src/f5';

export default function EndingRoute() {
  return (
    <>
      <Head>
        <title>Plant Your Seoul — 엔딩</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </Head>
      <EndingPage />
    </>
  );
}
