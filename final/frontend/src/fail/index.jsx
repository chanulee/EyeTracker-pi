import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useEntryFlow } from '../shared/EntryFlowContext';
import { useMobileLink } from '../shared/mobileLink/MobileLinkContext';
import { participantConnected, participantHasSent } from '../shared/mobileLink/slotPlants';
import {
  DISTRICTS,
  ROULETTE_LOGOS,
  placementForLogo,
  rouletteOffsetForLogo,
} from '../f3/AreaSelection/sequence';
import arc from '../f3/AreaSelection/AreaSelection.module.css';
import styles from './Fail.module.css';

function readStoredPlace() {
  try {
    return sessionStorage.getItem('seoul-district') || '';
  } catch {
    return '';
  }
}

function districtByName(name) {
  return DISTRICTS.find((item) => item.name === name) || null;
}

function preloadDistrictStreet(name) {
  if (typeof window === 'undefined' || !name) return Promise.resolve();
  const cached = window.__districtStreet;
  if (cached?.name === name && cached.image?.complete && cached.image.naturalWidth) {
    return Promise.resolve(cached.image);
  }
  const image = cached?.name === name && cached.image ? cached.image : new Image();
  if (cached?.name !== name) {
    image.decoding = 'async';
    image.src = `/api/district-street?name=${encodeURIComponent(name)}&v=2`;
    window.__districtStreet = { name, image };
  }
  if (image.complete) return Promise.resolve(image);
  return new Promise((resolve) => {
    const done = () => resolve(image);
    image.addEventListener('load', done, { once: true });
    image.addEventListener('error', done, { once: true });
  });
}

function leaveToFour(router, name) {
  const href = `/4?district=${encodeURIComponent(name)}`;
  const go = () => router.push(href);
  if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function') {
    go();
    return;
  }
  document.documentElement.classList.add('fail-four-transition');
  const transition = document.startViewTransition(() => go());
  transition.finished.catch(() => {}).finally(() => {
    document.documentElement.classList.remove('fail-four-transition');
  });
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
    <div className={arc.token} style={tokenStyle(placement, Boolean(colored && !logo.stack))}>
      <div
        className={arc.glass}
        style={{
          opacity: 1 - placement.glow,
          backgroundColor: `rgba(255, 255, 255, ${placement.chip})`,
        }}
      />
      {colored && logo.badge && !logo.stack ? (
        <img className={arc.badge} src={logo.badge} alt="" style={{ opacity: placement.glow }} />
      ) : (
        <>
          <img className={arc.disc} src="/3/circle-center-gradient.svg" alt="" style={{ opacity: placement.glow }} />
          <img className={arc.disc} src="/3/circle-center-glass.svg" alt="" style={{ opacity: placement.glow }} />
          {logo.texture ? <img className={arc.disc} src={logo.texture} alt="" style={textureStyle} /> : null}
        </>
      )}
      <img className={arc.mark} src={logo.src} alt="" style={sideMark} />
      {swaps && logo.centerCrop ? (
        <div className={arc.markCrop} style={centerMark}>
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
      {swaps && !logo.centerCrop ? <img className={arc.mark} src={logo.centerSrc} alt="" style={centerMark} /> : null}
    </div>
  );
}

function StillRoulette({ logoIndex }) {
  const offset = rouletteOffsetForLogo(logoIndex);
  return (
    <>
      <img className={arc.centerRing} src="/3/circle-center-ring.svg" alt="" />
      {ROULETTE_LOGOS.map((logo, index) => (
        <CircleToken key={logo.src} colored logo={logo} placement={placementForLogo(index, offset)} />
      ))}
    </>
  );
}

function Ring({ side, done }) {
  const left = side === 'A';
  return (
    <div className={`${styles.ring} ${left ? styles.ringLeft : styles.ringRight}`}>
      {done ? (
        <img className={styles.check} src={left ? '/fail/check-a.svg' : '/fail/check-b.svg'} alt="" />
      ) : (
        <>
          <img className={styles.disc} src={left ? '/fail/ring-left-disc.svg' : '/fail/ring-right-disc.svg'} alt="" />
          <div className={styles.spinner}>
            <img
              className={styles.track}
              src={left ? '/fail/ring-left-track.svg' : '/fail/ring-right-track.svg'}
              alt=""
            />
          </div>
        </>
      )}
      <p className={styles.label}>{done ? 'QR 인식 성공!' : 'QR 인식 중'}</p>
    </div>
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

function QrBorder({ tone = 'sora' }) {
  const borderRef = useRef(null);

  useEffect(() => {
    const border = borderRef.current;
    if (!border) return undefined;
    const shadows = tone === 'nabi' ? QR_BORDER_SHADOWS_NABI : QR_BORDER_SHADOWS;
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
  }, [tone]);

  return (
    <div
      ref={borderRef}
      className={`${styles.qrGlow} ${tone === 'nabi' ? styles.qrGlowNabi : ''}`}
    />
  );
}

/**
 * QR 이미지 — 로드 실패/스톨 시 자동 재시도(캐시버스트)로 항상 표시되게 한다.
 * DynamicQrCode(공유)를 건드리지 않기 위해 /fail 전용으로 둔다. 같은 /api/mobile-qr 사용.
 */
function FailQrImage({ url }) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const src = url
    ? `/api/mobile-qr?url=${encodeURIComponent(url)}&tone=light&a=${attempt}`
    : '';

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  useEffect(() => {
    if (!url || loaded) return undefined;
    const timer = window.setTimeout(() => setAttempt((n) => n + 1), 2000);
    return () => window.clearTimeout(timer);
  }, [url, loaded, attempt]);

  if (!url) return null;

  return (
    <>
      {!loaded ? <div className={styles.qrLoading} aria-hidden="true" /> : null}
      <img
        key={src}
        src={src}
        alt="모바일 접속 QR 코드"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(false)}
        style={
          loaded
            ? { width: '100%', height: '100%', objectFit: 'contain' }
            : { position: 'absolute', width: 1, height: 1, opacity: 0 }
        }
      />
    </>
  );
}

export default function FailScreen() {
  const router = useRouter();
  const { selectedDistrict } = useEntryFlow();
  const { slots, qrTargetUrlA, qrTargetUrlB, sessionId, startKioskSession, slotPlants, role, sendState } =
    useMobileLink();
  const [scale, setScale] = useState(1);
  const [district, setDistrict] = useState(DISTRICTS[0]);

  useEffect(() => {
    const fit = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const next = Math.max(width / 3881, height / 2183);
      setScale(next > 0 ? next : 1);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    const queryName = typeof router.query.district === 'string' ? router.query.district : '';
    const next = districtByName(queryName)
      || districtByName(selectedDistrict?.name)
      || districtByName(readStoredPlace())
      || DISTRICTS[0];
    setDistrict(next);
  }, [router.isReady, router.query.district, selectedDistrict]);

  useEffect(() => {
    if (!district?.name) return undefined;
    startKioskSession(district);
    router.prefetch(`/4?district=${encodeURIComponent(district.name)}`).catch(() => {});
    preloadDistrictStreet(district.name);
    return undefined;
  }, [district?.name, startKioskSession, router]);

  useEffect(() => {
    if (!district?.name || !sessionId || role !== 'kiosk') return undefined;
    sendState({ district: { name: district.name } });
    return undefined;
  }, [district?.name, sessionId, role, sendState]);

  const recognized = { A: Boolean(slots.A), B: Boolean(slots.B) };
  const recognizedCount = Number(recognized.A);

  const bothSent = participantHasSent(slotPlants);
  const bothJoined = participantConnected(slots);
  const advancedToFourRef = useRef(false);
  const advancedForSentRef = useRef(false);

  useEffect(() => {
    if (!router.isReady || !bothJoined || !district?.name) return undefined;
    if (role !== 'kiosk') return undefined;
    const timer = window.setTimeout(() => {
      if (advancedToFourRef.current) return;
      advancedToFourRef.current = true;
      preloadDistrictStreet(district.name).finally(() => leaveToFour(router, district.name));
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [router.isReady, bothJoined, district?.name, role, router]);

  useEffect(() => {
    if (!router.isReady || !bothSent || !district?.name) return undefined;
    const timer = window.setTimeout(() => {
      if (advancedForSentRef.current) return;
      advancedForSentRef.current = true;
      preloadDistrictStreet(district.name).finally(() => leaveToFour(router, district.name));
    }, 800);
    return () => window.clearTimeout(timer);
  }, [router.isReady, bothSent, district?.name, router]);

  const title = recognizedCount === 0
    ? 'NABI님의 모바일 인식을 기다리고 있어요'
    : 'NABI님의 모바일 인식이 완료되었어요';
  const subtitle = recognizedCount === 1
    ? '이제 모바일 웹에서 상상한 식물을 그려주세요. SORA의 식물은 함께 준비했어요.'
    : 'NABI님의 QR을 인식하고 모바일 웹으로 접속해주세요';

  return (
    <div className={arc.viewport}>
      <div className={arc.fit} style={{ width: 3881 * scale, height: 2183 * scale }}>
        <div className={arc.stage} style={{ transform: `scale(${scale})` }}>
          <img className={arc.bg} src="/3/bg.png" alt="" />
          <img className={arc.arc} src="/3/arc.svg" alt="" />
          <div className={arc.rouletteLayer}>
            <StillRoulette logoIndex={district.logoIndex} />
          </div>
          {qrTargetUrlA ? (
            <div className={styles.qrPair}>
              <div className={styles.qrSlot}>
                <div className={styles.qrFrame}>
                  <div className={styles.qrImageLive}>
                    <FailQrImage url={qrTargetUrlA} />
                  </div>
                  <QrBorder tone="nabi" />
                </div>
              </div>
            </div>
          ) : null}
          <p className={styles.title}>{title}</p>
          <p className={styles.subtitle}>{subtitle}</p>
          <div className={styles.veil} />
          <Ring side="A" done={recognized.A} />
        </div>
      </div>
    </div>
  );
}
