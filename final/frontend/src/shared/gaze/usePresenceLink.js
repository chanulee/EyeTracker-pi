import { useCallback, useEffect, useRef, useState } from 'react';

const WS_PATH = '/ws/presence';
const RETRY_MS = 1000;

function socketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${WS_PATH}`;
}

/**
 * /presence_test(sensor)와 /pre_opening(display)을 서버 웹소켓으로 잇는다.
 * 센서는 send 로 인식 상태와 통과 신호를 보내고, 디스플레이는 onMessage 로 받는다.
 * @param {'sensor' | 'display'} role
 * @param {(msg: object) => void} [onMessage]
 */
export default function usePresenceLink(role, onMessage, enabled = true) {
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState({ sensors: 0, displays: 0 });
  const socketRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled) return undefined;
    let closed = false;
    let retryTimer = 0;

    const connect = () => {
      if (closed) return;
      const socket = new WebSocket(socketUrl());
      socketRef.current = socket;
      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({ type: 'join', role }));
        setConnected(true);
      });
      socket.addEventListener('message', (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type === 'joined' || msg.type === 'peers') {
          setPeers({ sensors: msg.sensors || 0, displays: msg.displays || 0 });
        }
        onMessageRef.current?.(msg);
      });
      socket.addEventListener('close', () => {
        if (socketRef.current === socket) socketRef.current = null;
        setConnected(false);
        if (!closed) retryTimer = window.setTimeout(connect, RETRY_MS);
      });
    };

    connect();
    return () => {
      closed = true;
      window.clearTimeout(retryTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [role, enabled]);

  const send = useCallback((payload) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
  }, []);

  return { connected, peers, send };
}
