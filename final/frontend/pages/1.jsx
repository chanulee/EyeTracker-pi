import Head from 'next/head';
import Opening from '../src/op';

export default function OpeningPage() {
  return (
    <>
      <Head>
        <title>Plant Your Seoul — OP</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="format-detection" content="telephone=no" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </Head>
      <Opening />
    </>
  );
}
