// Reconnecting client. All coordinates are calibrated by the Mac server.
export function connectGaze(url, onGaze, onStatus = () => {}) {
  let ws, timer, watchdog, userId = null, sessionId = null, stopped = false;
  const invalid = () => onGaze({type: 'gaze', version: 1, user_id: userId, session_id: sessionId, valid: false, x: null, y: null});
  function connect() {
    if (stopped) return;
    ws = new WebSocket(url);
    ws.onopen = () => onStatus('connected');
    ws.onmessage = ({data}) => {
      try {
        const value = JSON.parse(data);
        if (value.type !== 'gaze' || value.version !== 1) return;
        if (value.valid && (!Number.isFinite(value.x) || !Number.isFinite(value.y))) return;
        userId = value.user_id ?? null; sessionId = value.session_id ?? null;
        clearTimeout(watchdog);
        watchdog = setTimeout(() => { invalid(); onStatus('stale'); }, 500);
        onGaze(value);
      } catch (_) { invalid(); }
    };
    ws.onclose = () => {
      clearTimeout(watchdog);
      invalid(); onStatus('disconnected');
      if (!stopped) timer = setTimeout(connect, 1000);
    };
    ws.onerror = () => ws.close();
  }
  connect();
  return () => { stopped = true; clearTimeout(timer); clearTimeout(watchdog); ws.close(); invalid(); };
}
