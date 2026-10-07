import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useEntryFlow } from '../../shared/EntryFlowContext';
import DynamicQrCode from '../../shared/mobileLink/DynamicQrCode';
import { useMobileLink } from '../../shared/mobileLink/MobileLinkContext';
import {
  DISTRICTS,
  ROULETTE_LOGOS,
  F_TOTAL_DURATION,
  S_DURATION_MS,
  STAGE,
  placementForLogo,
  rouletteOffsetForLogo,
  districtIndexForLandedOffset,
  startRoulette,
  stopRoulette,
} from './sequence';
import styles from './AreaSelection.module.css';

function Stage({ children }) {
  const viewportRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => {
      const box = viewportRef.current;
      const width = box?.clientWidth || window.innerWidth;
      const height = box?.clientHeight || window.innerHeight;
      // 1·2페이지는 창을 가득 채운다. 3번도 같은 화면을 덮도록 맞춘다.
      const next = Math.max(width / STAGE.width, height / STAGE.height);
      setScale(next > 0 ? next : 1);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <div className={styles.viewport} ref={viewportRef}>
      <div className={styles.fit} style={{ width: STAGE.width * scale, height: STAGE.height * scale }}>
        <div className={styles.stage} style={{ transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function tokenStyle(placement, colored) {
  return {
    left: `${placement.x}px`,
    top: `${placement.y}px`,
    width: `${placement.size}px`,
    height: `${placement.size}px`,
    opacity: placement.fade,
    zIndex: placement.glow > 0.2 ? 3 : 1,
    boxShadow:
      colored || placement.glow <= 0.05
        ? 'none'
        : `0 0 ${36.667 * placement.glow}px rgba(130,245,255,${0.54 * placement.glow}), 0 0 ${14.339 * placement.glow}px rgba(255,207,227,${placement.glow})`,
  };
}

function imageStyle(placement, fade, sidePosition) {
  const atSide = placement.glow < 0.35 && sidePosition === 'bottom';
  return {
    left: `${placement.imgX}px`,
    top: `${placement.imgY}px`,
    width: `${placement.imgW}px`,
    height: `${placement.imgH}px`,
    opacity: placement.imgOpacity * fade,
    objectFit: 'contain',
    objectPosition: atSide ? 'center bottom' : 'center center',
  };
}

function CircleToken({ logo, placement, colored }) {
  const swaps = Boolean(logo.centerSrc);
  const textureStyle = logo.full
    ? { opacity: placement.glow, width: '142%', height: '142%', left: '-21%', top: '-21%' }
    : { opacity: placement.glow };
  const logoFade = colored && !logo.stack ? 1 - placement.glow : 1;
  const sideMark = imageStyle(placement, (swaps ? 1 - placement.swap : 1) * logoFade, logo.sidePosition);
  const centerMark = {
    ...imageStyle(placement, placement.swap, logo.sidePosition),
    objectFit: logo.cover ? 'cover' : 'contain',
  };

  return (
    <div className={styles.token} style={tokenStyle(placement, Boolean(colored && !logo.stack))}>
      <div
        data-part="side"
        className={styles.glass}
        style={{
          opacity: 1 - placement.glow,
          backgroundColor: `rgba(255, 255, 255, ${placement.chip})`,
        }}
      />
      {colored && logo.badge && !logo.stack ? (
        <img className={styles.badge} src={logo.badge} alt="" style={{ opacity: placement.glow }} />
      ) : (
        <>
          <img data-part="center" className={styles.disc} src="/3/circle-center-gradient.svg" alt="" style={{ opacity: placement.glow }} />
          <img data-part="center" className={styles.disc} src="/3/circle-center-glass.svg" alt="" style={{ opacity: placement.glow }} />
          {logo.texture ? <img data-part="texture" className={styles.disc} src={logo.texture} alt="" style={textureStyle} /> : null}
        </>
      )}
      <img data-part="logo" className={styles.mark} src={logo.src} alt="" style={sideMark} />
      {swaps && logo.centerCrop ? (
        <div className={styles.markCrop} style={centerMark}>
          <img
            src={logo.centerSrc}
            alt=""
            style={{
              width: logo.centerCrop.width,
              height: logo.centerCrop.height,
              marginTop: logo.centerCrop.top,
              marginLeft: logo.centerCrop.left,
            }}
          />
        </div>
      ) : null}
      {swaps && !logo.centerCrop ? <img data-part="swap" className={styles.mark} src={logo.centerSrc} alt="" style={centerMark} /> : null}
    </div>
  );
}

function RouletteTrack({ children, ring }) {
  return (
    <>
      {ring ? <img className={styles.centerRing} src="/3/circle-center-ring.svg" alt="" /> : null}
      {children}
    </>
  );
}

function SpinningRoulette({ onComplete, targetOffset }) {
  const [offset, setOffset] = useState(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    startRoulette(setOffset, (landedOffset) => onCompleteRef.current(landedOffset), targetOffset);
    return () => stopRoulette();
  }, [targetOffset]);

  return (
    <RouletteTrack ring>
      {ROULETTE_LOGOS.map((logo, index) => (
        <CircleToken key={logo.src} colored logo={logo} placement={placementForLogo(index, offset)} />
      ))}
    </RouletteTrack>
  );
}

function StillCenter({ district }) {
  const mark = district.centerMark;
  const markStyle = {
    left: `${mark.x}px`,
    top: `${mark.y}px`,
    width: `${mark.w}px`,
    height: `${mark.h}px`,
    objectFit: 'cover',
    objectPosition: mark.position === 'bottom' ? 'center bottom' : 'center center',
  };

  const markNode = mark.crop ? (
    <div className={styles.markCrop} style={markStyle}>
      <img src={mark.src} alt="" style={{ width: mark.crop.width, height: mark.crop.height }} />
    </div>
  ) : (
    <img className={styles.mark} src={mark.src} alt="" style={markStyle} />
  );

  return (
    <div className={mark.disc ? `${styles.stillCenter} ${styles.stillPlain}` : styles.stillCenter}>
      {mark.disc ? <img className={styles.stillDiscImage} src={mark.disc} alt="" /> : null}
      <div className={styles.stillClip}>
        {mark.disc ? null : (
          <>
            <img className={styles.disc} src="/3/s-center-gradient.svg" alt="" />
            <img className={styles.disc} src="/3/s-center-glass.svg" alt="" />
            <img className={styles.disc} src={mark.texture} alt="" />
          </>
        )}
        {markNode}
      </div>
    </div>
  );
}

function StillRoulette({ district }) {
  const count = ROULETTE_LOGOS.length;
  const offset = rouletteOffsetForLogo(district.logoIndex);

  return (
    <RouletteTrack ring={false}>
      {ROULETTE_LOGOS.map((logo, index) => {
        const slot = (((index - offset) % count) + count) % count;
        if (slot === 4) return <StillCenter key={logo.src} district={district} />;
        return <CircleToken key={logo.src} logo={logo} placement={placementForLogo(index, offset)} />;
      })}
    </RouletteTrack>
  );
}

function Background({ hidden }) {
  return <img className={`${styles.bg} ${hidden ? styles.isHidden : ''}`} src="/3/bg.png" alt="" />;
}

function FindingVideo({ hidden }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (hidden) return undefined;
    const timer = setTimeout(() => setFading(true), Math.max(0, F_TOTAL_DURATION * 0.9));
    return () => clearTimeout(timer);
  }, [hidden]);

  return (
    <video
      className={`${styles.findingVideo} ${hidden || fading ? styles.isHidden : ''}`}
      src="/3/f001.mp4"
      autoPlay
      muted
      playsInline
    />
  );
}

const FINDING_MAP = { left: 1143, top: 749, width: 1544, height: 1108 };
const RESULT_MAP = { left: 1765, top: 526, width: 1904, height: 1269 };

const MAP_MARKERS = [
  [1177.28, 0, 42.3047],
  [698.445, 225.918, 268.219],
  [360.924, 387.934, 430.23],
  [237.609, 726.352, 768.66],
  [491.43, 961.277, 1003.57],
  [1560.7, 576.945, 619.25],
  [1392.39, 36.9023, 79.2109],
  [1224.98, 539.137, 581.445],
  [1414.88, 1059.38, 1101.69],
  [1036.87, 454.531, 496.84],
  [1011.47, 717, 759.309],
  [839.744, 711.961, 754.258],
  [1199.77, 1169.2, 1211.49],
  [770.453, 1037.79, 1080.08],
  [667.838, 1126.88, 1169.19],
];

function copyClass(phase, scene) {
  if (phase === scene) return styles.copyShow;
  if (scene === 's' && phase === 'q') return styles.copyLeave;
  return styles.copyHide;
}

function MovingMap({ phase }) {
  const atResult = phase !== 'f';

  return (
    <div
      className={`${styles.mapMotion} ${phase === 'f' || phase === 'q' ? styles.isGone : ''}`}
      style={atResult ? RESULT_MAP : FINDING_MAP}
    >
      <svg
        className={styles.mapSvg}
        viewBox="0 0 1904 1288"
        preserveAspectRatio="xMidYMid meet"
        overflow="visible"
      >
        <image
          href="/3/map1.png"
          x="6.29297"
          y="20.7031"
          width="1892.83"
          height="1261.9"
          preserveAspectRatio="none"
        />
        <rect x="6.29297" y="20.7031" width="1892.83" height="1261.9" fill="url(#seoulMapLine)" />
        {MAP_MARKERS.map(([x, headY, stemY]) => (
          <g key={`${x}-${headY}`}>
            <rect x={x} y={headY} width="25.2018" height="49.5037" fill="white" />
            <rect x={x} y={stemY} width="6.06358" height="32.5919" fill="white" />
          </g>
        ))}
        <defs>
          <pattern id="seoulMapLine" patternContentUnits="objectBoundingBox" width="1" height="1">
            <use href="#seoulMapLineImage" transform="scale(0.000791772 0.00118765)" />
          </pattern>
          <image id="seoulMapLineImage" href="/3/map.png" width="1263" height="842" preserveAspectRatio="none" />
        </defs>
      </svg>
    </div>
  );
}

function FindingCopy({ phase }) {
  const hidden = phase !== 'f';

  return (
    <>
      <h1 className={`${styles.fTitle} ${styles.fadeLayer} ${hidden ? styles.isHidden : ''}`}>
        서울특별시 자치구를 찾고 있어요
      </h1>
      <p className={`${styles.fBody} ${styles.fadeLayer} ${hidden ? styles.isHidden : ''}`}>
        토론 데이터를 기반으로, 서울특별시 25개 자치구 중
        <br />
        <strong>여러분이 상상하는 초록빛 서울</strong>에 가장 적합한 구를 선별하고 있어요
      </p>
      <p className={`${styles.fWait} ${styles.fadeLayer} ${hidden ? styles.isHidden : ''}`}>잠시만 기다려 주세요...</p>
    </>
  );
}

function DistrictGlow({ district, hidden }) {
  const glowRef = useRef(null);

  useEffect(() => {
    const glow = glowRef.current;
    const started = performance.now();
    let frame;

    const tick = (now) => {
      const elapsed = now - started;
      const turn = (elapsed / S_DURATION_MS) * Math.PI * 8;
      const wave = 0.5 - 0.5 * Math.cos(turn);
      glow.style.opacity = String(0.4 + 0.6 * wave);
      glow.style.transform = `scale(${0.86 + 0.22 * wave})`;
      if (elapsed < S_DURATION_MS) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={`${styles.districtGlow} ${hidden ? styles.isHidden : ''}`}
      style={{ left: district.glow.x, top: district.glow.y }}
    >
      <img ref={glowRef} src="/3/district-glow.svg" alt="" />
    </div>
  );
}

function SelectedCopy({ district, phase }) {
  const motion = copyClass(phase, 's');

  return (
    <>
      <h1
        className={`${styles.resultTitle} ${motion}`}
        style={district.title ? { left: district.title.x, top: district.title.y } : undefined}
      >
        <span className={styles.resultName}>{district.name}</span>
        <span>가 </span>
        <br />
        선정 되었어요
      </h1>
      <p className={`${styles.resultBody} ${styles.resultLines} ${motion}`}>
        {district.lines[0]}
        <br />
        {district.lines[1]}
      </p>
    </>
  );
}

const QR_BORDER_SHADOWS = [
  { x: 0, y: 22.262, blur: 21.816, color: 'rgba(255, 255, 255, 0.74)' },
  { x: -19.421, y: -19.421, blur: 97.103, color: 'rgba(250, 151, 255, 0.58)' },
  { x: 0, y: 8.014, blur: 5.343, color: '#fff' },
  { x: -35.619, y: 0, blur: 36.687, color: 'rgba(254, 206, 255, 0.62)' },
  { x: 16.507, y: -23.305, blur: 37.87, color: 'rgba(255, 255, 255, 0.6)' },
  { x: 0, y: 8.905, blur: 21.371, color: 'rgba(255, 203, 129, 0.88)' },
  { x: -3.562, y: -3.562, blur: 15.405, color: 'rgba(255, 255, 255, 0.38)' },
  { x: -8.905, y: -8.905, blur: 16.83, color: 'rgba(0, 0, 0, 0.25)' },
];
const QR_BORDER_SHADOWS_NABI = QR_BORDER_SHADOWS.map((shadow) =>
  shadow.color.startsWith('rgba(250, 151, 255') || shadow.color.startsWith('rgba(254, 206, 255')
    ? { ...shadow, color: 'rgba(142, 242, 105, 0.56)' }
    : shadow
);
const QR_BORDER_TURN_MS = 5000;
const MAP_FADE_OUT_MS = 1800;

function QrBorder({ tone = 'sora' }) {
  const borderRef = useRef(null);
  const shadows = tone === 'nabi' ? QR_BORDER_SHADOWS_NABI : QR_BORDER_SHADOWS;

  useEffect(() => {
    const border = borderRef.current;
    const started = performance.now();
    let frame;

    const tick = (now) => {
      const angle = (((now - started) % QR_BORDER_TURN_MS) / QR_BORDER_TURN_MS) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      border.style.boxShadow = shadows.map((shadow) => {
        const x = shadow.x * cos - shadow.y * sin;
        const y = shadow.x * sin + shadow.y * cos;
        return `inset ${x.toFixed(2)}px ${y.toFixed(2)}px ${shadow.blur}px ${shadow.color}`;
      }).join(', ');
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [shadows]);

  return (
    <div
      ref={borderRef}
      className={`${styles.qrGlow} ${tone === 'nabi' ? styles.qrGlowNabi : ''}`}
    />
  );
}

function QrNameTag({ tone }) {
  const src = tone === 'nabi' ? '/3/qr-tag-nabi.svg' : '/3/qr-tag-sora.svg';

  return (
    <img
      className={`${styles.qrNameTag} ${tone === 'nabi' ? styles.qrNameTagNabi : styles.qrNameTagSora}`}
      src={src}
      alt=""
      aria-hidden="true"
    />
  );
}

function QrCard({ url, label, live, revealed, tone = 'sora' }) {
  return (
    <div className={styles.qrSlot}>
      <QrNameTag tone={tone} />
      <div className={`${styles.qrFrame} ${revealed ? styles.qrOn : ''}`}>
        <div className={live ? styles.qrImageLive : styles.qrImage}>
          {live ? (
            url ? (
              <DynamicQrCode url={url} alt={`${label} 연결 QR 코드`} tone="light" />
            ) : (
              <div className={styles.qrImageLiveLoading} aria-hidden="true" />
            )
          ) : (
            <img src="/3/qr.png" alt="" aria-hidden="true" />
          )}
        </div>
        <QrBorder tone={tone} />
      </div>
    </div>
  );
}

function QrCopy({ phase, qrUrlA, qrUrlB, joinedCount = 0 }) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (phase !== 'q') {
      setRevealed(false);
      return undefined;
    }
    const timeout = setTimeout(() => setRevealed(true), MAP_FADE_OUT_MS);
    return () => clearTimeout(timeout);
  }, [phase]);

  const motion = revealed ? styles.copyShow : styles.copyHide;

  return (
    <>
      <svg
        className={`${styles.qrHeading} ${motion}`}
        width="1846"
        height="132"
        viewBox="0 0 1846 132"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="M104.443 0V54.9316H124.219V66.6504H104.443V131.25H90.5273V0H104.443ZM0 95.5078C10.3271 95.5078 22.3389 95.5078 34.8633 95.1416V81.8115C20.0684 79.6143 10.4004 70.6787 10.5469 58.0078C10.4004 43.2129 23.2178 33.4717 41.8945 33.3984C60.498 33.4717 73.4619 43.2129 73.5352 58.0078C73.4619 70.6787 63.6475 79.6875 48.7793 81.8115V94.6289C60.4248 94.043 72.1436 93.0908 83.0566 91.5527L83.9355 101.807C55.5176 106.86 24.8291 107.153 2.19727 107.08L0 95.5078ZM2.49023 26.6602V15.5273H34.8633V0.292969H48.7793V15.5273H81.1523V26.6602H2.49023ZM23.584 58.0078C23.584 66.3574 30.9082 71.5576 41.8945 71.4844C52.8809 71.5576 60.1318 66.3574 60.2051 58.0078C60.1318 49.585 52.8809 44.2383 41.8945 44.2383C30.9082 44.2383 23.584 49.585 23.584 58.0078ZM195.193 11.1328V22.2656H223.758V0.146484H237.674V95.8008H223.758V61.8164H195.193V73.2422H134.256V11.1328H195.193ZM148.025 62.2559H181.57V22.4121H148.025V62.2559ZM151.98 128.467V87.0117H166.043V117.188H240.604V128.467H151.98ZM195.193 50.3906H223.758V33.6914H195.193V50.3906ZM408.48 65.1855V76.6113H288.51V65.1855H341.391V45.9961H355.16V65.1855H408.48ZM295.395 42.1875C320.517 38.9648 341.171 24.1699 341.244 7.61719V2.05078H355.307V7.61719C355.233 24.3896 375.814 38.9648 401.156 42.1875L395.736 53.1738C374.936 49.8047 356.552 39.6973 348.202 25.1953C339.853 39.6973 321.469 49.8047 300.521 53.1738L295.395 42.1875ZM301.84 99.1699V88.1836H393.539V131.25H379.477V99.1699H301.84ZM493.594 84.375H509.414L519.668 97.6318C526.626 90.9668 530.874 80.2002 530.947 65.7715C530.874 39.9902 517.324 26.001 499.16 26.0742C480.85 26.001 467.3 39.9902 467.227 65.7715C467.3 91.5527 480.85 105.542 499.16 105.469C502.529 105.469 505.679 105.029 508.682 104.077L493.594 84.375ZM451.26 65.7715C451.26 31.8604 471.548 11.2793 499.16 11.2793C526.553 11.2793 546.914 31.8604 546.914 65.7715C546.914 85.3271 540.176 100.415 529.189 109.717L543.545 128.32H526.992L518.057 116.602C512.344 119.019 505.972 120.264 499.16 120.264C471.548 120.264 451.26 99.6094 451.26 65.7715ZM562.078 118.799V12.7441H599.871C624.554 12.7441 636.639 26.4404 636.639 45.9961C636.639 60.2783 630.193 71.0449 617.303 75.9521L640.74 118.799H622.43L600.896 78.8086H599.871H578.191V118.799H562.078ZM578.191 64.8926H598.26C613.86 64.8193 620.379 57.9346 620.379 45.9961C620.379 34.0576 613.86 26.5869 598.26 26.5137H578.191V64.8926ZM785.033 12.1582V24.4629C784.96 40.4297 785.106 58.5938 779.467 85.8398L765.844 84.375C768.261 73.1689 769.579 63.2812 770.385 54.4189L691.43 59.0332L689.379 47.0215L771.044 43.7988C771.337 36.6943 771.41 30.3955 771.41 24.4629V23.584H693.334V12.1582H785.033ZM679.125 114.258V102.686H724.682V69.4336H738.451V102.686H798.803V114.258H679.125ZM912.111 62.2559V73.6816H820.705V11.7188H910.939V23.1445H834.475V62.2559H912.111ZM805.764 113.965V102.393H925.881V113.965H805.764ZM1052.37 60.2051V70.8984H932.256V60.2051H1052.37ZM946.465 90.0879V80.127H1037.58V108.984H960.527V119.824H1041.68V129.639H946.611V99.7559H1023.81V90.0879H946.465ZM947.344 13.1836V3.36914H1037.29V31.7871H961.406V41.748H1039.48V51.5625H947.637V22.5586H1023.37V13.1836H947.344ZM1201.5 0.146484V95.5078H1187.58V0.146484H1201.5ZM1095.3 41.4551C1095.37 22.4854 1110.46 9.00879 1130.31 8.93555C1150.08 9.00879 1165.17 22.4854 1165.17 41.4551C1165.17 60.7178 1150.08 74.1211 1130.31 74.1211C1110.46 74.1211 1095.37 60.7178 1095.3 41.4551ZM1108.92 41.4551C1108.85 53.833 1118.08 61.9629 1130.31 61.9629C1142.32 61.9629 1151.55 53.833 1151.55 41.4551C1151.55 29.3701 1142.32 21.0938 1130.31 21.0938C1118.08 21.0938 1108.85 29.3701 1108.92 41.4551ZM1115.66 128.467V85.8398H1129.72V117.188H1205.46V128.467H1115.66ZM1267.05 18.8965C1266.98 37.0605 1279.29 53.6865 1299.57 60.3516L1292.54 71.3379C1277.31 66.0645 1265.96 55.3711 1260.02 41.6748C1254.16 56.3232 1242.59 67.9688 1227.06 73.5352L1220.03 62.6953C1240.47 55.4443 1252.77 37.6465 1252.85 18.8965V6.29883H1267.05V18.8965ZM1239.22 96.3867V85.1074H1328.14V131.25H1314.22V96.3867H1239.22ZM1314.22 78.8086V0H1328.14V78.8086H1314.22ZM1410.83 21.6797V32.959H1345.65V21.6797H1371.43V3.80859H1385.2V21.6797H1410.83ZM1349.89 71.0449C1349.82 53.3936 1361.83 40.8691 1378.31 40.8691C1394.94 40.8691 1406.8 53.3936 1406.88 71.0449C1406.8 88.9893 1394.94 101.587 1378.31 101.514C1361.83 101.587 1349.82 88.9893 1349.89 71.0449ZM1362.2 71.0449C1362.13 82.1777 1368.86 89.6484 1378.31 89.6484C1387.76 89.6484 1394.57 82.1777 1394.57 71.0449C1394.57 60.1318 1387.76 52.5146 1378.31 52.4414C1368.86 52.5146 1362.13 60.1318 1362.2 71.0449ZM1416.84 125.098V2.92969H1430.02V54.6387H1445.11V0H1458.29V131.25H1445.11V66.0645H1430.02V125.098H1416.84ZM1592.26 73.9746V85.2539H1538.94V131.104H1525.31V85.2539H1472.58V73.9746H1592.26ZM1479.32 53.0273C1503.78 49.6582 1524.14 35.083 1524.58 18.8965H1483.71V7.76367H1580.98V18.8965H1540.4C1540.62 35.083 1560.83 49.6582 1585.66 53.0273L1580.54 64.0137C1559 60.6445 1540.4 50.0244 1532.42 35.083C1524.36 50.0244 1505.83 60.6445 1484.59 64.0137L1479.32 53.0273ZM1639.21 35.8887C1639.21 56.8359 1648 79.1748 1665.57 89.9414L1657.81 100.635C1645.51 93.2373 1637.23 80.127 1632.69 64.9658C1627.93 81.5918 1618.85 95.8008 1606.1 103.564L1597.46 93.1641C1615.99 82.0312 1625.8 58.8135 1625.73 36.4746V12.0117H1639.21V35.8887ZM1651.37 57.7148V46.1426H1671.73V2.49023H1684.91V124.805H1671.73V57.7148H1651.37ZM1698.83 131.25V0H1712.16V131.25H1698.83ZM1845.97 103.271V114.844H1725.86V103.271H1754.57V68.9941C1743.8 63.0615 1737.21 53.6865 1737.28 41.8945C1737.21 21.2402 1757.5 7.69043 1785.62 7.61719C1813.82 7.69043 1834.11 21.2402 1834.11 41.8945C1834.11 53.4668 1827.81 62.7686 1817.26 68.7012V103.271H1845.97ZM1750.76 41.8945C1750.76 55.957 1765.04 65.1123 1785.62 65.1855C1806.06 65.1123 1820.56 55.957 1820.63 41.8945C1820.56 27.7588 1806.06 18.75 1785.62 18.75C1765.04 18.75 1750.76 27.7588 1750.76 41.8945ZM1768.34 103.271H1803.2V74.1211C1797.85 75.3662 1791.92 76.0254 1785.62 76.0254C1779.47 76.0254 1773.61 75.3662 1768.34 74.1211V103.271Z" fill="white" />
      </svg>
      <p className={`${styles.qrBody} ${motion}`}>
        이제 모든 준비는 끝났어요! 화면 속 QR를 인식해 휴대폰으로 직접 식물을 그려볼 차례예요.
        <br />
        NABI님의 QR로 접속해주세요. SORA의 식물은 안내 시나리오로 함께 자라납니다.
      </p>
      <div className={`${styles.qrPair} ${revealed ? styles.qrPairOn : ''}`}>
        <QrCard url={qrUrlA} label="NABI" tone="nabi" live={phase === 'q'} revealed={revealed} />
      </div>
      {phase === 'q' && joinedCount > 0 ? (
        <p className={`${styles.resultBody} ${motion} ${styles.qrJoinStatus}`} role="status">
          NABI 모바일 접속 {joinedCount}/1
           · 잠시 후 다음 화면으로 이동합니다
        </p>
      ) : null}
    </>
  );
}

export default function AreaSelection() {
  const router = useRouter();
  const { setSelectedDistrict } = useEntryFlow();
  const { startKioskSession, qrTargetUrlA, qrTargetUrlB, slots } = useMobileLink();
  const kioskSessionRef = useRef(false);
  const [phase, setPhase] = useState('f');
  const [districtIndex, setDistrictIndex] = useState(0);
  const [districtReady, setDistrictReady] = useState(false);
  const district = DISTRICTS[districtIndex];
  const joinedCount = Number(slots.A);

  const finishFinding = useCallback((landedOffset) => {
    const index = districtIndexForLandedOffset(landedOffset);
    const next = DISTRICTS[index];
    setDistrictIndex(index);
    setSelectedDistrict(next);
    try {
      sessionStorage.setItem('seoul-district', next.name);
    } catch {
      // 저장이 막혀도 화면 전환은 이어간다.
    }
    setPhase('s');
  }, [setSelectedDistrict]);

  useEffect(() => {
    setDistrictIndex(Math.floor(Math.random() * DISTRICTS.length));
    setDistrictReady(true);
  }, []);

  useEffect(() => {
    if (phase !== 's') return undefined;
    const timeout = setTimeout(() => setPhase('q'), S_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [phase]);

  useEffect(() => {
    if (!router.isReady || phase !== 'q') return undefined;
    if (joinedCount < 1) return undefined;
    const name = district.name;
    const delayMs = joinedCount >= 2 ? 800 : 1000;
    const timeout = setTimeout(() => {
      try {
        sessionStorage.setItem('seoul-district', name);
      } catch {
        // 저장이 막혀도 화면 전환은 이어간다.
      }
      router.push(`/fail?district=${encodeURIComponent(name)}`);
    }, delayMs);
    return () => clearTimeout(timeout);
  }, [router.isReady, phase, joinedCount, router, district]);

  useEffect(() => {
    if (!districtReady || !district?.name) return undefined;
    const image = new Image();
    image.src = `/api/district-street?name=${encodeURIComponent(district.name)}&v=2`;
    return undefined;
  }, [districtReady, district]);

  useLayoutEffect(() => {
    if (phase === 'f') {
      kioskSessionRef.current = false;
      return undefined;
    }
    if (phase !== 's' && phase !== 'q') return undefined;
    if (kioskSessionRef.current) return undefined;

    kioskSessionRef.current = true;
    try {
      startKioskSession(district);
    } catch {
      kioskSessionRef.current = false;
    }
    return undefined;
  }, [phase, district, startKioskSession]);

  useEffect(() => {
    if (phase !== 'q' || !district?.name) return undefined;
    startKioskSession(district);
    return undefined;
  }, [phase, district?.name, startKioskSession]);

  return (
    <Stage>
      <Background hidden={phase === 'f'} />
      <FindingVideo hidden={phase !== 'f'} />
      <img className={styles.arc} src="/3/arc.svg" alt="" />
      <div className={styles.rouletteLayer}>
        {districtReady ? (
          <SpinningRoulette targetOffset={rouletteOffsetForLogo(district.logoIndex)} onComplete={finishFinding} />
        ) : null}
      </div>
      <FindingCopy phase={phase} />
      <MovingMap phase={phase} />
      <SelectedCopy district={district} phase={phase} />
      {phase !== 'f' && <DistrictGlow district={district} hidden={phase !== 's'} />}
      <QrCopy phase={phase} qrUrlA={qrTargetUrlA} qrUrlB={qrTargetUrlB} joinedCount={joinedCount} />
    </Stage>
  );
}
