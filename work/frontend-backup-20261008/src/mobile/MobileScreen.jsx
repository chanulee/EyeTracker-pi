import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useEntryFlow } from '../shared/EntryFlowContext';
import MobileDrawingPage from './MobileDrawingPage';
import MobileConvertPage from './MobileConvertPage';
import MobileConvertShader from './MobileConvertShader';
import MobileEndPage from './MobileEndPage';
import MobileCompletePage from './MobileCompletePage';
import MobileLoadingPage from './MobileLoadingPage';
import MobilePromptPage from './MobilePromptPage';
import MobilePlantVideo from './MobilePlantVideo';
import MobileSavePage from './MobileSavePage';
import MobileTag2Page from './MobileTag2Page';
import MobileTagPage from './MobileTagPage';
import { MOBILE_LOADING_ARTBOARD } from './mobileConfig';
import { MOBILE_PHASE } from './mobilePhases';
import { MobileStage } from './MobileStage';
import {
  DRAWING_TO_SAVE_MS,
  LOADING_TO_DRAWING_MS,
  SAVE_TO_TAG_MS,
  TAG2_TO_CONVERT_MS,
  CONVERT_HOLD_MS,
  CONVERT_TO_END_MS,
} from './mobileTransition';
import { useMobileLink } from '../shared/mobileLink/MobileLinkContext';
import { resolveMobileDistrictCopy } from './mobileDistrictCopy';
import { pickEndPlantVariant } from './mobileEndPlantVariants';
import { useDevMobileInput } from './useDevMobileInput';
import styles from './MobileScreen.module.css';

export default function MobileScreen() {
  const router = useRouter();
  const { districtFromKiosk, sessionId, mobileSlot, slots, sendState, disconnect } =
    useMobileLink();
  const entryFlow = useEntryFlow();
  const selectedDistrict = entryFlow?.selectedDistrict;
  const districtFromQuery = useMemo(() => {
    if (!router.isReady) return '';
    const raw = router.query.district;
    const name = typeof raw === 'string' ? raw : raw?.[0];
    return name ? decodeURIComponent(name) : '';
  }, [router.isReady, router.query.district]);
  const districtName =
    districtFromKiosk?.name ?? districtFromQuery ?? selectedDistrict?.name ?? '종로구';
  const districtCopy = useMemo(
    () => resolveMobileDistrictCopy(districtName),
    [districtName]
  );
  const [phase, setPhase] = useState(MOBILE_PHASE.LOADING);
  const [loadingMounted, setLoadingMounted] = useState(true);
  const [loadingExit, setLoadingExit] = useState(false);
  const [promptMounted, setPromptMounted] = useState(false);
  const [promptExit, setPromptExit] = useState(false);
  const [bgBrighten, setBgBrighten] = useState(false);
  const [bgHeavyBlur, setBgHeavyBlur] = useState(false);
  const completedRef = useRef(false);

  const [drawingMounted, setDrawingMounted] = useState(false);
  const [drawingEnterFromLoading, setDrawingEnterFromLoading] = useState(false);
  const [drawingExit, setDrawingExit] = useState(false);

  const [saveMounted, setSaveMounted] = useState(false);
  const [saveExit, setSaveExit] = useState(false);

  const [tag2Mounted, setTag2Mounted] = useState(false);
  const [tag2Exit, setTag2Exit] = useState(false);

  const [convertMounted, setConvertMounted] = useState(false);
  const [convertExit, setConvertExit] = useState(false);

  const [plantDrawingUrl, setPlantDrawingUrl] = useState(null);
  const [plantName, setPlantName] = useState('');
  const [endPlantVariant, setEndPlantVariant] = useState(null);
  const [endMounted, setEndMounted] = useState(false);
  const [endExit, setEndExit] = useState(false);
  const [completeMounted, setCompleteMounted] = useState(false);

  const isCompletedRef = useRef(false);

  const isLinkedSession = Boolean(sessionId && mobileSlot);
  const bothPeersConnected = Boolean(sessionId && mobileSlot && slots.A && slots.B);

  useEffect(() => {
    completedRef.current = false;
    isCompletedRef.current = false;
  }, [sessionId, mobileSlot]);

  useEffect(() => {
    if (bothPeersConnected) {
      completedRef.current = false;
    }
  }, [bothPeersConnected]);

  const pushPlantDrawing = useCallback(
    (drawingUrl, plantNameOverride) => {
      if (!isLinkedSession || !drawingUrl || !mobileSlot) return;
      try {
        sendState({
          type: 'plant_drawing',
          slot: mobileSlot,
          drawingUrl,
          plantName: (plantNameOverride ?? plantName).trim(),
        });
      } catch {
        /* ignore */
      }
    },
    [isLinkedSession, mobileSlot, plantName, sendState]
  );

  const goPrompt = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setBgBrighten(true);
    setLoadingExit(true);
    setPhase(MOBILE_PHASE.PROMPT);
    setPromptMounted(true);
    window.setTimeout(() => {
      setLoadingMounted(false);
      setLoadingExit(false);
      setBgBrighten(false);
    }, LOADING_TO_DRAWING_MS);
  }, []);

  const goDrawingFromPrompt = useCallback(() => {
    setPromptExit(true);
    setPhase(MOBILE_PHASE.DRAWING);
    setDrawingEnterFromLoading(true);
    setDrawingMounted(true);
    window.setTimeout(() => {
      setPromptMounted(false);
      setPromptExit(false);
      setDrawingEnterFromLoading(false);
    }, LOADING_TO_DRAWING_MS);
  }, []);

  useEffect(() => {
    if (!isLinkedSession || !bothPeersConnected) return undefined;
    if (phase !== MOBILE_PHASE.LOADING) return undefined;
    goPrompt();
    return undefined;
  }, [isLinkedSession, bothPeersConnected, phase, goPrompt]);

  useEffect(() => {
    if (phase !== MOBILE_PHASE.PROMPT || !bothPeersConnected) return undefined;
    const timer = window.setTimeout(() => {
      goDrawingFromPrompt();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [phase, bothPeersConnected, goDrawingFromPrompt]);

  const goSave = useCallback(
    (dataUrl) => {
      const url = dataUrl ?? null;
      setPlantDrawingUrl(url);
      if (url) pushPlantDrawing(url, '');
      setDrawingExit(true);
      setPhase(MOBILE_PHASE.SAVE);
      setSaveMounted(true);
      window.setTimeout(() => {
        setDrawingMounted(false);
        setDrawingExit(false);
      }, DRAWING_TO_SAVE_MS);
    },
    [pushPlantDrawing]
  );

  const goTag = useCallback(() => {
    setBgHeavyBlur(true);
    setSaveExit(true);
    setPhase(MOBILE_PHASE.TAG);
    window.setTimeout(() => {
      setSaveMounted(false);
      setSaveExit(false);
    }, SAVE_TO_TAG_MS);
  }, []);

  const goTag2 = useCallback(() => {
    setPhase(MOBILE_PHASE.TAG2);
    setTag2Mounted(true);
  }, []);

  const goConvert = useCallback(
    (confirmedName) => {
      const nextName = confirmedName?.trim() || plantName.trim();
      if (!nextName) return;
      setPlantName(nextName);
      if (plantDrawingUrl) pushPlantDrawing(plantDrawingUrl, nextName);
      setTag2Exit(true);
      setPhase(MOBILE_PHASE.CONVERT);
      window.setTimeout(() => {
        setTag2Mounted(false);
        setTag2Exit(false);
        setConvertMounted(true);
      }, TAG2_TO_CONVERT_MS);
    },
    [plantDrawingUrl, plantName, pushPlantDrawing]
  );

  useDevMobileInput({
    phase,
    setPlantName,
    onConfirmName: goConvert,
  });

  const goEnd = useCallback(() => {
    setEndPlantVariant(pickEndPlantVariant(districtName, { sessionId, slot: mobileSlot }));
    // 전송(END) 화면에서는 Figma처럼 깔끔한 그라디언트 배경(영상/강블러 없음)
    setBgHeavyBlur(false);
    setConvertExit(true);
    setPhase(MOBILE_PHASE.END);
    setEndMounted(true);
    window.setTimeout(() => {
      setConvertMounted(false);
      setConvertExit(false);
    }, CONVERT_TO_END_MS);
  }, [districtName, sessionId, mobileSlot]);

  const handleSendComplete = useCallback(() => {
    if (isCompletedRef.current) return;
    isCompletedRef.current = true;

    // 1. 중간에 소켓이 재연결됐어도 키오스크가 최종 그림을 갖도록 다시 전달
    try {
      if (plantDrawingUrl) {
        sendState({
          type: 'plant_drawing',
          drawingUrl: plantDrawingUrl,
          plantName: plantName.trim(),
          slot: mobileSlot,
        });
      }
      sendState({
        type: 'plant_sent',
        plantName: plantName.trim(),
        plantVariant: endPlantVariant?.id ?? null,
        plantImage: endPlantVariant?.image ?? null,
        district: districtName,
        slot: mobileSlot,
      });
    } catch {
      /* ignore */
    }

    // 2. 모바일 화면을 체험 완료(COMPLETE) 단계로 전환
    setEndExit(true);
    setPhase(MOBILE_PHASE.COMPLETE);
    setCompleteMounted(true);
    window.setTimeout(() => {
      setEndMounted(false);
      setEndExit(false);
    }, 450);

    // 3. 웹소켓 연결 종료하여 서버 및 키오스크의 참여 인원/슬롯에서 즉시 배제
    // 짧은 지연(150ms)을 주어 sendState 패킷이 소켓 버퍼를 통해 안전하게 나간 뒤 close()
    window.setTimeout(() => {
      disconnect();
    }, 150);
  }, [
    disconnect,
    districtName,
    endPlantVariant?.id,
    endPlantVariant?.image,
    mobileSlot,
    plantDrawingUrl,
    plantName,
    sendState,
  ]);

  useEffect(() => {
    if (phase !== MOBILE_PHASE.CONVERT || !convertMounted) return undefined;
    const advance = window.setTimeout(() => {
      goEnd();
    }, CONVERT_HOLD_MS);
    return () => window.clearTimeout(advance);
  }, [phase, convertMounted, goEnd]);

  const { width, height } = MOBILE_LOADING_ARTBOARD;

  const showPlantVideo =
    phase === MOBILE_PHASE.LOADING ||
    phase === MOBILE_PHASE.PROMPT ||
    phase === MOBILE_PHASE.DRAWING ||
    phase === MOBILE_PHASE.SAVE ||
    phase === MOBILE_PHASE.TAG ||
    phase === MOBILE_PHASE.TAG2 ||
    phase === MOBILE_PHASE.CONVERT;

  return (
    <div className={styles.mobileRoot}>
      <div className={styles.backdropLayer} aria-hidden="true">
        {showPlantVideo && (
          <MobilePlantVideo
            loop={isLinkedSession && !bothPeersConnected}
            paused={phase !== MOBILE_PHASE.LOADING && phase !== MOBILE_PHASE.PROMPT}
            onEnded={undefined}
          />
        )}
        <div
          className={`${styles.backdropGradient} ${
            loadingMounted ? styles.backdropGradientLoading : ''
          } ${loadingExit ? styles.backdropGradientLoadingExit : ''          } ${
            phase === MOBILE_PHASE.END || phase === MOBILE_PHASE.COMPLETE ? styles.backdropGradientEnd : ''
          }`}
        />
        <div className={`${styles.bgBrighten} ${bgBrighten ? styles.bgBrightenActive : ''}`} />
        <div
          className={`${styles.bgHeavyBlur} ${bgHeavyBlur ? styles.bgHeavyBlurActive : ''} ${
            phase === MOBILE_PHASE.TAG ||
            phase === MOBILE_PHASE.TAG2 ||
            phase === MOBILE_PHASE.CONVERT
              ? styles.bgHeavyBlurSoft
              : ''
          }`}
        />
        {(phase === MOBILE_PHASE.CONVERT || convertMounted) && (
          <MobileConvertShader fading={phase !== MOBILE_PHASE.CONVERT} />
        )}
      </div>
      <MobileStage width={width} height={height} fit="width">
        <div className={styles.session}>
        {loadingMounted && (
          <div
            className={`${styles.layer} ${styles.layerLoading} ${
              loadingExit ? styles.layerLoadingExit : ''
            }`}
          >
            <MobileLoadingPage
              districtName={districtName}
              loadingLead={districtCopy.loadingLead}
              waitingForPeer={isLinkedSession && !bothPeersConnected}
              exiting={loadingExit}
            />
          </div>
        )}
        {promptMounted && (
          <div
            className={`${styles.layer} ${styles.layerPrompt} ${
              promptExit ? styles.layerPromptExit : ''
            }`}
          >
            <MobilePromptPage onStart={goDrawingFromPrompt} exiting={promptExit} />
          </div>
        )}
        {drawingMounted && (
          <div
            className={`${styles.layer} ${styles.layerDrawing} ${
              drawingExit ? styles.layerDrawingExit : ''
            }`}
          >
            <MobileDrawingPage
              districtName={districtName}
              drawingLeadLines={districtCopy.drawingLeadLines}
              tags={districtCopy.tags}
              enterFromLoading={drawingEnterFromLoading}
              exiting={drawingExit}
              onNext={goSave}
            />
          </div>
        )}
        {saveMounted && (
          <div
            className={`${styles.layer} ${styles.layerSave} ${saveExit ? styles.layerSaveExit : ''}`}
          >
            <MobileSavePage
              districtName={districtName}
              drawingLeadLines={districtCopy.drawingLeadLines}
              tags={districtCopy.tags}
              enterFromDrawing={!saveExit}
              exiting={saveExit}
              drawingUrl={plantDrawingUrl}
              drawingLayerVisible={drawingMounted}
              onComplete={goTag}
            />
          </div>
        )}
        {phase === MOBILE_PHASE.TAG && (
          <div className={`${styles.layer} ${styles.layerTag}`}>
            <MobileTagPage enterFromSave onStartNaming={goTag2} />
          </div>
        )}
        {tag2Mounted && (
          <div
            className={`${styles.layer} ${styles.layerTag} ${
              tag2Exit ? styles.layerTagExit : ''
            }`}
          >
            <MobileTag2Page
              plantName={plantName}
              exiting={tag2Exit}
              onPlantNameChange={setPlantName}
              onConfirmName={goConvert}
            />
          </div>
        )}
        {convertMounted && (
          <div
            className={`${styles.layer} ${styles.layerConvert} ${
              convertExit ? styles.layerConvertExit : ''
            }`}
          >
            <MobileConvertPage
              plantName={plantName}
              drawingUrl={plantDrawingUrl}
              enterFromTag
              exiting={convertExit}
            />
          </div>
        )}
        {(phase === MOBILE_PHASE.END || endMounted) && (
          <div
            className={`${styles.layer} ${styles.layerEnd} ${
              endExit ? styles.layerEndExit : ''
            }`}
          >
            <MobileEndPage
              plantName={plantName}
              plantVariant={endPlantVariant}
              enterFromTag
              onSend={handleSendComplete}
            />
          </div>
        )}
        {(phase === MOBILE_PHASE.COMPLETE || completeMounted) && (
          <div className={`${styles.layer} ${styles.layerComplete}`}>
            <MobileCompletePage plantName={plantName} plantVariant={endPlantVariant} />
          </div>
        )}
        </div>
      </MobileStage>
    </div>
  );
}
