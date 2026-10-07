import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import MobileCardPage from '../../src/mobile/MobileCardPage';
import MobileViewport from '../../src/mobile/MobileViewport';
import mobileStyles from '../../src/mobile/mobilePage.module.css';

function queryValue(value) {
  if (typeof value === 'string') return value;
  return Array.isArray(value) ? value[0] || '' : '';
}

/** 키오스크 카드의 QR이 열어 주는 화면. 슬롯마다 다른 카드를 받아 간다. */
export default function MobileCardRoute() {
  const router = useRouter();

  useEffect(() => {
    if (document.getElementById('pretendard-mobile-font')) return;
    const font = document.createElement('link');
    font.id = 'pretendard-mobile-font';
    font.rel = 'stylesheet';
    font.href =
      'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css';
    document.head.appendChild(font);
  }, []);

  return (
    <>
      <Head>
        <title>식물 도감 카드 — Plant Your Seoul</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1"
        />
        <meta name="theme-color" content="#000000" />
        <meta name="mobile-web-app-capable" content="yes" />
      </Head>
      <div className={mobileStyles.shell}>
        <MobileViewport>
          <MobileCardPage
            district={queryValue(router.query.district)}
            slot={queryValue(router.query.slot)}
            name={queryValue(router.query.name)}
            ready={router.isReady}
          />
        </MobileViewport>
      </div>
    </>
  );
}
