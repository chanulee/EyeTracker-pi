import { useEffect } from 'react';
import Head from 'next/head';
import MobileLinkStatus from '../src/mobile/MobileLinkStatus';
import MobileViewport from '../src/mobile/MobileViewport';
import MobileScreen from '../src/mobile/MobileScreen';
import mobileStyles from '../src/mobile/mobilePage.module.css';

export default function MobilePage() {
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
        <title>Plant Your Seoul — Mobile</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, interactive-widget=overlays-content"
        />
        <meta name="theme-color" content="#000000" />
        <meta name="mobile-web-app-capable" content="yes" />
      </Head>
      <div className={mobileStyles.shell}>
        <MobileLinkStatus />
        <MobileViewport>
          <MobileScreen />
        </MobileViewport>
      </div>
    </>
  );
}
