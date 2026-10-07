import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/router';
import {
  buildMobileJoinUrl,
  getMobilePublicOriginSync,
  resolveMobilePublicOrigin,
} from './publicOrigin';
import { MSG, WS_PATH } from './protocol';
import { createMobileSessionId } from './sessionId';
import {
  persistKioskSession,
  readPersistedKioskSession,
} from './kioskSessionPersist';
import { normalizeLinkDistrict } from './normalizeDistrict';
import { mergeSlotPlantFromState, resolvePlantSlot } from './slotPlants';
import { guidePlant } from '../../f2/guideScenario.mjs';

const MobileLinkContext = createContext(null);

function clientIdKey(sessionId) {
  return `seoul-mobile-client-${sessionId}`;
}

function readMobileClientId(sessionId) {
  try {
    return sessionStorage.getItem(clientIdKey(sessionId)) || '';
  } catch {
    return '';
  }
}

function storeMobileClientId(sessionId, clientId) {
  try {
    sessionStorage.setItem(clientIdKey(sessionId), clientId);
  } catch {
    /* ignore */
  }
}

function wsUrl() {
  if (typeof window === 'undefined') return '';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${WS_PATH}`;
}

export function MobileLinkProvider({ children }) {
  const router = useRouter();
  const wsRef = useRef(null);
  const linkSessionIdRef = useRef(null);
  const [sessionId, setSessionId] = useState(null);
  const [role, setRole] = useState(null);
  const [status, setStatus] = useState('idle');
  const [slots, setSlots] = useState({ A: false, B: false });
  const [mobileSlot, setMobileSlot] = useState(null);
  const [districtFromKiosk, setDistrictFromKiosk] = useState(null);
  const [linkDistrict, setLinkDistrict] = useState(null);
  const [slotPlants, setSlotPlants] = useState({ A: {}, B: {} });
  const [lastError, setLastError] = useState(null);
  const [mobilePublicOrigin, setMobilePublicOrigin] = useState(() => getMobilePublicOriginSync());

  const refreshMobilePublicOrigin = useCallback(() => {
    resolveMobilePublicOrigin().then((origin) => {
      if (origin) setMobilePublicOrigin(origin);
    });
  }, []);

  useEffect(() => {
    const refreshUnlessMobile = () => {
      if (window.location.pathname !== '/mobile') refreshMobilePublicOrigin();
    };
    refreshUnlessMobile();
    const onFocus = () => refreshUnlessMobile();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshMobilePublicOrigin]);

  const [disconnectedManually, setDisconnectedManually] = useState(false);
  const manualCloseRef = useRef(false);
  const lastConnectRef = useRef(null);
  const connectRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const readyRef = useRef(false);
  const pendingStateRef = useRef([]);
  const closeAfterFlushRef = useRef(false);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const disconnectInternal = useCallback(() => {
    clearReconnectTimer();
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
  }, [clearReconnectTimer]);

  const disconnect = useCallback(() => {
    if (pendingStateRef.current.length > 0 && !manualCloseRef.current) {
      closeAfterFlushRef.current = true;
      return;
    }
    manualCloseRef.current = true;
    setDisconnectedManually(true);
    disconnectInternal();
    setStatus('closed');
  }, [disconnectInternal]);

  const flushPendingState = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !readyRef.current) return;
    const queue = pendingStateRef.current;
    pendingStateRef.current = [];
    queue.forEach((msg) => ws.send(JSON.stringify(msg)));
    if (closeAfterFlushRef.current) {
      closeAfterFlushRef.current = false;
      window.setTimeout(() => disconnect(), 150);
    }
  }, [disconnect]);

  const applyDistrict = useCallback((raw) => {
    const next = normalizeLinkDistrict(raw);
    if (next) setDistrictFromKiosk(next);
    return next;
  }, []);

  const connect = useCallback(
    ({ sessionId: id, linkRole, district, slot }) => {
      if (typeof window === 'undefined' || !id) return;
      manualCloseRef.current = false;
      setDisconnectedManually(false);
      disconnectInternal();

      const normalizedDistrict = normalizeLinkDistrict(district);
      const requestedSlot = slot === 'A' || slot === 'B' ? slot : null;
      lastConnectRef.current = {
        sessionId: id,
        linkRole,
        district: normalizedDistrict,
        slot: requestedSlot,
      };
      if (linkRole === 'kiosk' && normalizedDistrict) {
        setLinkDistrict(normalizedDistrict);
        setDistrictFromKiosk(normalizedDistrict);
      }

      const sessionChanged = linkSessionIdRef.current !== id;
      linkSessionIdRef.current = id;
      readyRef.current = false;
      if (sessionChanged) {
        pendingStateRef.current = [];
        closeAfterFlushRef.current = false;
      }
      setSessionId(id);
      setRole(linkRole);
      setStatus('connecting');
      setLastError(null);
      if (sessionChanged) {
        setSlots({ A: false, B: false });
        setSlotPlants({ A: {}, B: {} });
      }
      if (linkRole === 'mobile') {
        setMobileSlot(null);
      }

      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: MSG.JOIN,
            sessionId: id,
            role: linkRole,
            district: normalizedDistrict,
            slot: requestedSlot,
          })
        );
        if (linkRole === 'mobile') {
          ws.send(
            JSON.stringify({
              type: 'claim',
              sessionId: id,
              clientId: readMobileClientId(id),
              slot: requestedSlot,
            })
          );
        }
        if (linkRole === 'kiosk') {
          persistKioskSession(id, normalizedDistrict);
          if (normalizedDistrict) {
            ws.send(
              JSON.stringify({
                type: MSG.STATE,
                sessionId: id,
                payload: { district: normalizedDistrict },
              })
            );
          }
        }
      };

      ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.type === MSG.JOINED) {
          if (msg.slot === 'A' || msg.slot === 'B') setMobileSlot(msg.slot);
          if (linkRole === 'mobile' && typeof msg.clientId === 'string') {
            storeMobileClientId(id, msg.clientId);
          }
          readyRef.current = true;
          flushPendingState();
          setStatus(linkRole === 'kiosk' ? 'waiting_mobile' : 'waiting_kiosk');
          return;
        }
        if (msg.type === MSG.SLOTS && msg.slots) {
          setSlots({ A: Boolean(msg.slots.A), B: Boolean(msg.slots.B) });
          return;
        }
        if (msg.type === MSG.PAIRED) {
          setStatus('paired');
          applyDistrict(msg.district);
          if (msg.slot === 'A' || msg.slot === 'B') {
            setSlots((prev) => ({ ...prev, [msg.slot]: true }));
          }
          return;
        }
        if (msg.type === MSG.STATE) {
          if (msg.payload?.district) {
            applyDistrict(msg.payload.district);
          }
          const slot = resolvePlantSlot(msg.slot, msg.payload);
          if (linkRole === 'kiosk' && slot && msg.payload) {
            setSlotPlants((prev) => mergeSlotPlantFromState(prev, slot, msg.payload));
          }
          return;
        }
        if (msg.type === MSG.PEER_LEFT) {
          if (msg.slot === 'A' || msg.slot === 'B') {
            setSlots((prev) => ({ ...prev, [msg.slot]: false }));
          }
          if (linkRole === 'mobile' && msg.role === 'kiosk') {
            setStatus('waiting_kiosk');
          } else if (linkRole === 'kiosk' && msg.role === 'mobile') {
            setStatus('waiting_mobile');
          }
          return;
        }
        if (msg.type === MSG.ERROR) {
          if (msg.message === 'replaced') manualCloseRef.current = true;
          setLastError(msg.message || 'link error');
          setStatus('error');
        }
      };

      ws.onerror = () => {
        setLastError('WebSocket 연결 실패');
        setStatus('error');
      };

      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        wsRef.current = null;
        readyRef.current = false;
        setStatus((s) => (s === 'error' ? s : 'closed'));
        if (linkRole === 'kiosk') {
          setSlots({ A: false, B: false });
        }
        if (manualCloseRef.current) return;
        clearReconnectTimer();
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          const last = lastConnectRef.current;
          if (manualCloseRef.current || !last || last.sessionId !== id) return;
          connectRef.current?.(last);
        }, 1000);
      };
    },
    [applyDistrict, clearReconnectTimer, disconnectInternal, flushPendingState]
  );

  connectRef.current = connect;

  const startKioskSession = useCallback(
    (district) => {
      refreshMobilePublicOrigin();
      const normalized = normalizeLinkDistrict(district);
      const districtName = normalized?.name ?? '';

      const ws = wsRef.current;
      if (
        sessionId &&
        role === 'kiosk' &&
        ws &&
        (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
      ) {
        if (normalized) {
          setLinkDistrict(normalized);
          setDistrictFromKiosk(normalized);
          persistKioskSession(sessionId, normalized);
          if (lastConnectRef.current?.sessionId === sessionId) {
            lastConnectRef.current = { ...lastConnectRef.current, district: normalized };
          }
        }
        return sessionId;
      }

      const persisted = readPersistedKioskSession();
      if (persisted?.sessionId && districtName && persisted.districtName === districtName) {
        connect({
          sessionId: persisted.sessionId,
          linkRole: 'kiosk',
          district: normalized ?? { name: persisted.districtName },
        });
        return persisted.sessionId;
      }

      const id = createMobileSessionId();
      persistKioskSession(id, normalized);
      connect({ sessionId: id, linkRole: 'kiosk', district: normalized });
      return id;
    },
    [connect, refreshMobilePublicOrigin, sessionId, role]
  );

  const joinMobileSession = useCallback(
    (id, slot) => {
      if (!id) return;
      connect({ sessionId: id, linkRole: 'mobile', slot });
    },
    [connect]
  );

  const sendState = useCallback((payload) => {
    if (!sessionId) return;
    const msg = { type: MSG.STATE, sessionId, payload };
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && readyRef.current) {
      ws.send(JSON.stringify(msg));
      return;
    }
    if (role === 'mobile') pendingStateRef.current.push(msg);
  }, [sessionId, role]);

  const mobileJoinRef = useRef(null);

  useEffect(() => {
    const pathname = window.location.pathname || router.pathname;
    if (pathname !== '/mobile') return undefined;
    if (disconnectedManually) return undefined;
    const search = new URLSearchParams(window.location.search);
    const join = router.query.join ?? search.get('join');
    const id = typeof join === 'string' ? join : join?.[0];
    const slotQuery = router.query.slot ?? search.get('slot');
    const rawSlot = typeof slotQuery === 'string' ? slotQuery : slotQuery?.[0];
    const requestedSlot = rawSlot === 'A' || rawSlot === 'B' ? rawSlot : null;
    const joinKey = requestedSlot ? `${id}:${requestedSlot}` : id;
    if (!id || mobileJoinRef.current === joinKey) return undefined;
    mobileJoinRef.current = joinKey;

    const districtQuery = router.query.district ?? search.get('district');
    const districtName =
      typeof districtQuery === 'string' ? districtQuery : districtQuery?.[0];
    if (districtName) {
      applyDistrict(districtName);
    }

    joinMobileSession(id, requestedSlot);
    return () => {
      mobileJoinRef.current = null;
      disconnect();
    };
  }, [
    router.pathname,
    joinMobileSession,
    disconnect,
    disconnectedManually,
    applyDistrict,
  ]);

  const qrOrigin = mobilePublicOrigin || getMobilePublicOriginSync();
  const qrDistrictName = districtFromKiosk?.name ?? linkDistrict?.name ?? '';
  const qrTargetUrl = sessionId
    ? buildMobileJoinUrl(sessionId, qrOrigin, qrDistrictName)
    : '';
  const qrTargetUrlA = sessionId
    ? buildMobileJoinUrl(sessionId, qrOrigin, qrDistrictName, 'A')
    : '';
  const qrTargetUrlB = sessionId
    ? buildMobileJoinUrl(sessionId, qrOrigin, qrDistrictName, 'B')
    : '';

  const displayPlants = useMemo(() => role === 'kiosk'
    ? { ...slotPlants, B: guidePlant((linkDistrict || districtFromKiosk)?.name) }
    : slotPlants, [role, slotPlants, linkDistrict, districtFromKiosk]);

  const value = useMemo(
    () => ({
      sessionId,
      role,
      status,
      slots,
      mobileSlot,
      districtFromKiosk,
      slotPlants: displayPlants,
      lastError,
      mobilePublicOrigin,
      qrTargetUrl,
      qrTargetUrlA,
      qrTargetUrlB,
      startKioskSession,
      joinMobileSession,
      sendState,
      disconnect,
      isPaired: status === 'paired',
    }),
    [
      sessionId,
      role,
      status,
      slots,
      mobileSlot,
      districtFromKiosk,
      displayPlants,
      lastError,
      mobilePublicOrigin,
      qrTargetUrl,
      qrTargetUrlA,
      qrTargetUrlB,
      startKioskSession,
      joinMobileSession,
      sendState,
      disconnect,
    ]
  );

  return <MobileLinkContext.Provider value={value}>{children}</MobileLinkContext.Provider>;
}

export function useMobileLink() {
  const ctx = useContext(MobileLinkContext);
  if (!ctx) {
    throw new Error('useMobileLink must be used inside MobileLinkProvider');
  }
  return ctx;
}
