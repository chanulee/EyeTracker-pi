import { useEffect, useRef } from 'react';

export function usePiSensors(enabled = true) {
  const sensorsRef = useRef({ 'viewer-1': null, 'viewer-2': null });
  useEffect(() => {
    if (!enabled) return undefined;
    let disposed = false;
    const sockets = new Set(), timers = new Set();
    const connect = userId => {
      const viewer = `viewer-${userId}`;
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/sensors?user_id=${userId}`);
      sockets.add(ws);
      ws.onmessage = ({ data }) => {
        try {
          const packet = JSON.parse(data);
          if (packet.type === 'sensors' && packet.user_id === userId)
            sensorsRef.current[viewer] = { ...packet, receivedAt: performance.now() };
        } catch { /* Ignore malformed messages. */ }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        sockets.delete(ws); sensorsRef.current[viewer] = null;
        if (!disposed) {
          const timer = setTimeout(() => { timers.delete(timer); connect(userId); }, 1000);
          timers.add(timer);
        }
      };
    };
    connect(1);
    return () => { disposed = true; timers.forEach(clearTimeout); sockets.forEach(ws => ws.close()); sensorsRef.current = { 'viewer-1': null, 'viewer-2': null }; };
  }, [enabled]);
  return sensorsRef;
}
