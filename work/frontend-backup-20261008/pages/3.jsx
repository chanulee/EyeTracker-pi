import Head from 'next/head';
import AreaSelection from '../src/f3/AreaSelection';

export default function AreaSelectionPage() {
  return (
    <>
      <Head>
        <title>Plant Your Seoul — 장소 선택</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </Head>
      <AreaSelection />
    </>
  );
}
