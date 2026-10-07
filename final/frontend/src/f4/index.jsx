import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useEntryFlow } from '../shared/EntryFlowContext';
import { useMobileLink } from '../shared/mobileLink/MobileLinkContext';
import { participantHasSent, participantConnected } from '../shared/mobileLink/slotPlants';
import QuietStreet from './QuietStreet';
import GlassSwirl from './GlassSwirl';
import styles from './PageFour.module.css';

const STAGE = { width: 3881, height: 2183 };
const TRAVEL_MS = 7000;
const SWIRL_AFTER_MS = 5600;
/** 유리 소용돌이가 켜진 뒤(1.8초 페이드 + 잠깐 감상) 엔딩 /5 로 넘어가기까지. */
const LEAVE_AFTER_SWIRL_MS = 4000;
const PLACES = ['종로구', '마포구', '강남구'];

/**
 * 모바일 이미지는 블롭이 합쳐져 있어, 키오스크 원 안에는 식물만 있는 컷을 쓴다.
 * 자치구마다 두 식물만 쓴다(src/mobile/mobileEndPlantVariants.js 와 같은 목록).
 * jongno-c, mapo-a, gangnam-c 는 쓰지 않는다.
 */
const KIOSK_PLANT_IMAGES = {
  'jongno-a': '/4/plants/jongno-a.png',
  'jongno-b': '/4/plants/jongno-b.png',
  'mapo-b': '/4/plants/mapo-b.png',
  'mapo-c': '/4/plants/mapo-c.png',
  'gangnam-a': '/4/plants/gangnam-a.png',
  'gangnam-b': '/4/plants/gangnam-b.png',
};

const PLACEHOLDER_PLANTS = [
  { name: '몬스테라', image: '/4/plant-left.png', tone: 'mint' },
  { name: '금목서향새싹', image: '/4/plant-right.png', tone: 'lilac' },
];

/** 모바일과 같은 짝. 슬롯이 뒤바뀌어 들어와도 이 그림이 그 자리에 가게 한다. */
const PLANT_PAIR_BY_DISTRICT = {
  종로구: ['jongno-a', 'jongno-b'],
  마포구: ['mapo-b', 'mapo-c'],
  강남구: ['gangnam-a', 'gangnam-b'],
};

function liveForSide(slotPlants, districtName, side) {
  const pair = PLANT_PAIR_BY_DISTRICT[districtName] || PLANT_PAIR_BY_DISTRICT.종로구;
  const want = pair[side === 'B' ? 1 : 0];
  const fromA = slotPlants?.A;
  const fromB = slotPlants?.B;
  if (fromA?.plantVariant === want) return fromA;
  if (fromB?.plantVariant === want) return fromB;
  return slotPlants?.[side] ?? {};
}

function readStoredPlace() {
  try {
    const stored = sessionStorage.getItem('seoul-district') || '';
    return PLACES.includes(stored) ? stored : '';
  } catch {
    return '';
  }
}

export default function PageFour() {
  const router = useRouter();
  const { selectedDistrict } = useEntryFlow();
  const { startKioskSession, sessionId, role, slotPlants, slots } = useMobileLink();
  const viewportRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [step, setStep] = useState('travel');
  const [streetReady, setStreetReady] = useState(false);
  const [placeName, setPlaceName] = useState('');
  const [swirlOn, setSwirlOn] = useState(false);
  const travelStarted = useRef(false);
  const kioskEnsured = useRef(false);

  useLayoutEffect(() => {
    const queryName = typeof router.query.district === 'string' ? router.query.district : '';
    const fromUrl = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('district') || ''
      : '';
    const contextName = selectedDistrict?.name || '';
    const next = [queryName, fromUrl, contextName, readStoredPlace()].find((item) => PLACES.includes(item)) || '종로구';
    setPlaceName((current) => (current === next ? current : next));
  }, [router.isReady, router.query.district, selectedDistrict]);

  useEffect(() => {
    const fit = () => {
      const box = viewportRef.current;
      const width = box?.clientWidth || window.innerWidth;
      const height = box?.clientHeight || window.innerHeight;
      const next = Math.max(width / STAGE.width, height / STAGE.height);
      setScale(next > 0 ? next : 1);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    if (!streetReady || travelStarted.current) return undefined;
    travelStarted.current = true;
    if (participantHasSent(slotPlants)) {
      setStep('slots');
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setStep((current) => {
        if (current === 'slots') return current;
        if (!participantConnected(slots)) return 'travel';
        return 'draw';
      });
    }, TRAVEL_MS);
    return () => window.clearTimeout(timer);
  }, [streetReady, slotPlants, slots]);

  useEffect(() => {
    if (!streetReady || participantHasSent(slotPlants)) return undefined;
    if (!participantConnected(slots)) return undefined;
    setStep((current) => (current === 'slots' ? current : 'draw'));
    return undefined;
  }, [streetReady, slots, slotPlants]);

  useEffect(() => {
    if (!placeName || kioskEnsured.current) return undefined;
    if (sessionId && role === 'kiosk') {
      kioskEnsured.current = true;
      return undefined;
    }
    kioskEnsured.current = true;
    startKioskSession({ name: placeName });
    return undefined;
  }, [placeName, sessionId, role, startKioskSession]);

  const bothSent = participantHasSent(slotPlants);

  useEffect(() => {
    if (!bothSent) return undefined;
    setStep('slots');
    return undefined;
  }, [bothSent]);

  useEffect(() => {
    if (step !== 'slots') {
      setSwirlOn(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setSwirlOn(true), SWIRL_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [step]);

  // 소용돌이까지 보여준 뒤 배정된 자치구의 엔딩(/5)으로 이동한다.
  useEffect(() => {
    if (!swirlOn || !placeName) return undefined;
    const timer = window.setTimeout(() => {
      router.push(`/5?district=${encodeURIComponent(placeName)}`);
    }, LEAVE_AFTER_SWIRL_MS);
    return () => window.clearTimeout(timer);
  }, [swirlOn, placeName, router]);

  const slotPlantsView = useMemo(
    () =>
      ['A', 'B'].map((slotKey, index) => {
        const fallback = PLACEHOLDER_PLANTS[index];
        const live = liveForSide(slotPlants, placeName, slotKey);
        const plantImage = KIOSK_PLANT_IMAGES[live?.plantVariant] || live?.plantImage;
        const drawingUrl = plantImage ? null : live?.drawingUrl;
        return {
          key: slotKey,
          name: live?.plantName?.trim() || fallback.name,
          image: plantImage || drawingUrl || fallback.image,
          tone: fallback.tone,
          isUserDrawing: Boolean(drawingUrl),
          isPicked: Boolean(plantImage),
        };
      }),
    [slotPlants, placeName]
  );

  return (
    <div className={styles.viewport} ref={viewportRef}>
      <div className={styles.fit} style={{ width: STAGE.width * scale, height: STAGE.height * scale }}>
        <div className={styles.stage} style={{ transform: `scale(${scale})` }}>
          {placeName ? (
            <QuietStreet
              name={placeName}
              still={step === 'travel'}
              hold={step === 'slots'}
              onReady={() => setStreetReady(true)}
            />
          ) : null}
          {streetReady && (step === 'travel' || step === 'draw') ? (
            <div className={`${styles.bubble} ${styles.bubbleTravel} ${step === 'draw' ? styles.bubbleLeave : ''}`}>
              <p className={styles.copy}>
                상상한 식물을 심을 <span className={styles.place}>{placeName}로 </span>이동중이에요...
              </p>
            </div>
          ) : null}
          {step === 'draw' || step === 'slots' ? (
            <div className={`${styles.bubble} ${styles.bubbleDraw} ${step === 'draw' ? styles.bubbleEnter : styles.bubbleLeaveSoft}`}>
              <p className={styles.copy}>
                이 공간에 어떤 식물이 자라면 좋을까요?
                <br />
                모바일 화면에 원하는 식물을 그려주세요
              </p>
            </div>
          ) : null}
          {step === 'slots' ? (
            <>
              <div className={`${styles.sproutCopy} ${styles.sproutSequence}`}>
                {placeName === '강남구' ? (
                  <>
                    <svg className={styles.gangnamTitle} viewBox="0 0 2518 169" role="img" aria-label="두 분의 식물이 새싹을 틔웠어요!">
                      <defs>
                        <linearGradient id="gangnamTitleFill" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0" stopColor="#070002" />
                          <stop offset="1" stopColor="#657D82" />
                        </linearGradient>
                        <filter id="gangnamTitleShadow" x="-15%" y="-45%" width="130%" height="190%" colorInterpolationFilters="sRGB">
                          <feDropShadow dx="0" dy="0" stdDeviation="10" floodColor="#4d4d4d" floodOpacity="0.25" />
                        </filter>
                      </defs>
                      <text
                        x="1259"
                        y="122"
                        textAnchor="middle"
                        fill="url(#gangnamTitleFill)"
                        filter="url(#gangnamTitleShadow)"
                        fontFamily="Pretendard, sans-serif"
                        fontSize="130"
                        style={{ letterSpacing: '-2.6px' }}
                      >
                        두 분의 식물이 <tspan fontWeight="700">새싹을 틔웠어요!</tspan>
                      </text>
                    </svg>
                    <svg className={styles.gangnamSub} viewBox="0 0 2518 84" role="img" aria-label={`이제 ${placeName}로 함께 이동해 직접 심어볼게요`}>
                      <defs>
                        <linearGradient id="gangnamSubFill" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0" stopColor="#4A5860" />
                          <stop offset="1" stopColor="#417097" />
                        </linearGradient>
                      </defs>
                      <text
                        x="1259"
                        y="60"
                        textAnchor="middle"
                        fill="url(#gangnamSubFill)"
                        fontFamily="Pretendard, sans-serif"
                        fontSize="60"
                        fontWeight="600"
                        style={{ letterSpacing: '-1.2px' }}
                      >
                        이제 {placeName}로 함께 이동해 직접 심어볼게요
                      </text>
                    </svg>
                  </>
                ) : placeName === '마포구' ? (
                  <>
                    <svg className={styles.mapoTitle} viewBox="0 0 2518 169" role="img" aria-label="두 분의 식물이 새싹을 틔웠어요!">
                      <defs>
                        <filter id="mapoTitleShadow" x="-15%" y="-45%" width="130%" height="190%" colorInterpolationFilters="sRGB">
                          <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#000" floodOpacity="0.25" />
                        </filter>
                      </defs>
                      <text
                        x="1259"
                        y="122"
                        textAnchor="middle"
                        fill="#FFFFFF"
                        filter="url(#mapoTitleShadow)"
                        fontFamily="Pretendard, sans-serif"
                        fontSize="130"
                        style={{ letterSpacing: '-2.6px' }}
                      >
                        두 분의 식물이 <tspan fontWeight="700">새싹을 틔웠어요!</tspan>
                      </text>
                    </svg>
                    <svg className={styles.mapoSub} viewBox="0 0 2518 84" role="img" aria-label={`이제 ${placeName}로 함께 이동해 직접 심어볼게요`}>
                      <text
                        x="1259"
                        y="60"
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontFamily="Pretendard, sans-serif"
                        fontSize="60"
                        fontWeight="600"
                        style={{ letterSpacing: '-1.2px' }}
                      >
                        이제 {placeName}로 함께 이동해 직접 심어볼게요
                      </text>
                    </svg>
                  </>
                ) : (
                  <>
                    <p className={styles.sproutTitle}>
                      두 분의 식물이 <b>새싹을 틔웠어요!</b>
                    </p>
                    <p className={styles.sproutSub}>이제 {placeName}로 함께 이동해 직접 심어볼게요</p>
                  </>
                )}
              </div>
              {slotPlantsView.map((plant, index) => (
                <div
                  key={plant.key}
                  className={`${styles.plantSlot} ${index === 0 ? styles.slotLeft : styles.slotRight} ${styles.slotSequence}`}
                >
                  <div className={styles.orb}>
                    <div className={styles.orbClip}>
                      <img
                        className={`${styles.plant} ${plant.isUserDrawing ? styles.plantUserDrawing : ''} ${
                          plant.isPicked ? styles.plantPicked : ''
                        }`}
                        src={plant.image}
                        alt=""
                      />
                    </div>
                    <GlassSwirl live={swirlOn} phase={index === 0 ? 0 : 2.4} />
                    <img
                      className={`${styles.orbRing} ${swirlOn ? styles.orbRingFade : ''}`}
                      src="/4/orb-grown.svg"
                      alt=""
                    />
                    <img
                      className={`${styles.orbRing} ${styles.orbRingClear} ${swirlOn ? styles.orbRingClearOn : ''}`}
                      src="/4/orb-grown-clear.svg"
                      alt=""
                    />
                  </div>
                  <p className={`${styles.namePill} ${plant.tone === 'lilac' ? styles.nameLilac : styles.nameMint}`}>
                    <span className={styles.nameText}>{plant.name}</span>
                  </p>
                </div>
              ))}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
