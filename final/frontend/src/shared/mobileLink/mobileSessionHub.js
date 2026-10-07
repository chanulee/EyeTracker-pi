const crypto = require('crypto');
const WebSocket = require('ws');

/** @typedef {'A' | 'B'} MobileSlot */
/** @typedef {{ ws: import('ws').WebSocket | null, role: 'mobile', slot: MobileSlot, clientId: string }} MobilePeer */
/** @typedef {{ ws: import('ws').WebSocket, role: 'kiosk', district?: object | null }} KioskPeer */
/** @typedef {{ kiosk?: KioskPeer, A?: MobilePeer, B?: MobilePeer, idleTimer?: NodeJS.Timeout }} Room */

const SLOTS = ['A', 'B'];
const ROOM_IDLE_MS = 10 * 60 * 1000;

/** @type {Map<string, Room>} */
const rooms = new Map();

function send(ws, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

/** 한 번 접속한 모바일은 탭이 백그라운드로 가서 소켓이 끊겨도 자리를 유지한다. */
function slotSnapshot(room) {
  return { A: Boolean(room.A), B: Boolean(room.B) };
}

function broadcastSlots(sessionId) {
  const room = rooms.get(sessionId);
  if (!room) return;
  const msg = { type: 'slots', sessionId, slots: slotSnapshot(room) };
  send(room.kiosk?.ws, msg);
  SLOTS.forEach((slot) => send(room[slot]?.ws, msg));
}

function normalizeDistrict(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const name = raw.trim();
    return name ? { name } : null;
  }
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  return name ? { ...raw, name } : null;
}

function tellMobilePaired(sessionId, slot) {
  const room = rooms.get(sessionId);
  const peer = room?.[slot];
  if (!room?.kiosk?.ws || !peer?.ws) return;
  const district = normalizeDistrict(room.kiosk.district);
  send(peer.ws, { type: 'paired', sessionId, role: 'kiosk', slot, district });
  if (district) {
    send(peer.ws, { type: 'state', sessionId, payload: { district } });
  }
}

function pickSlot(room, clientId, requestedSlot) {
  if (requestedSlot === 'B') return null;
  return 'A';
}

function hasLiveSocket(room) {
  return Boolean(room.kiosk?.ws || SLOTS.some((slot) => room[slot]?.ws));
}

function scheduleIdleCleanup(sessionId) {
  const room = rooms.get(sessionId);
  if (!room || hasLiveSocket(room)) return;
  if (room.idleTimer) clearTimeout(room.idleTimer);
  room.idleTimer = setTimeout(() => {
    const current = rooms.get(sessionId);
    if (current && !hasLiveSocket(current)) rooms.delete(sessionId);
  }, ROOM_IDLE_MS);
}

/**
 * @param {import('ws').WebSocket} ws
 * @param {{ sessionId: string, role: 'kiosk' | 'mobile', district?: object | null, clientId?: string }} meta
 */
function attachMobileLinkClient(ws, meta) {
  const { sessionId, role } = meta;
  if (!sessionId || (role !== 'kiosk' && role !== 'mobile')) {
    send(ws, { type: 'error', message: 'invalid join' });
    ws.close();
    return;
  }

  let room = rooms.get(sessionId);
  if (!room) {
    room = {};
    rooms.set(sessionId, room);
  }
  if (room.idleTimer) {
    clearTimeout(room.idleTimer);
    room.idleTimer = undefined;
  }

  let joinedSlot = null;
  let claimTimer = null;

  const assignMobileSlot = (requestedClientId, requestedSlot) => {
    if (joinedSlot || ws.readyState !== WebSocket.OPEN) return;
    const current = rooms.get(sessionId);
    if (!current) return;
    const clientId =
      typeof requestedClientId === 'string' && requestedClientId
        ? requestedClientId
        : crypto.randomUUID();
    const slot = pickSlot(current, clientId, requestedSlot || meta.slot);
    if (!slot) {
      send(ws, { type: 'error', message: 'room full' });
      ws.close();
      return;
    }
    SLOTS.forEach((other) => {
      if (other !== slot && current[other]?.clientId === clientId) {
        delete current[other];
      }
    });
    const previous = current[slot];
    if (previous?.ws && previous.ws !== ws) {
      send(previous.ws, { type: 'error', message: 'replaced' });
      try {
        previous.ws.close();
      } catch {
        /* ignore */
      }
    }
    joinedSlot = slot;
    current[slot] = {
      ws,
      role: 'mobile',
      slot,
      clientId,
      plantEvents: previous?.clientId === clientId ? previous.plantEvents : undefined,
    };
    send(ws, { type: 'joined', sessionId, role: 'mobile', slot, clientId });
    tellMobilePaired(sessionId, slot);
    broadcastSlots(sessionId);
  };

  if (role === 'kiosk') {
    if (room.kiosk) {
      try {
        room.kiosk.ws.close();
      } catch {
        /* ignore */
      }
    }
    room.kiosk = { ws, role, district: normalizeDistrict(meta.district) };
    send(ws, { type: 'joined', sessionId, role });
    SLOTS.forEach((slot) => tellMobilePaired(sessionId, slot));
    broadcastSlots(sessionId);
    SLOTS.forEach((slot) => {
      const events = room[slot]?.plantEvents;
      if (!events) return;
      ['plant_drawing', 'plant_sent'].forEach((type) => {
        if (events[type]) send(ws, { type: 'state', sessionId, slot, payload: events[type] });
      });
    });
  } else if (meta.clientId) {
    assignMobileSlot(meta.clientId);
  } else {
    // server.js 는 join 만 넘기므로 clientId 는 뒤따르는 claim 메시지로 받는다.
    claimTimer = setTimeout(() => assignMobileSlot(null), 500);
  }

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    const current = rooms.get(sessionId);
    if (!current) return;

    if (msg.type === 'claim' && role === 'mobile') {
      if (claimTimer) {
        clearTimeout(claimTimer);
        claimTimer = null;
      }
      assignMobileSlot(msg.clientId, msg.slot);
      return;
    }

    if (msg.type === 'state' && role === 'kiosk') {
      if (msg.payload?.district && current.kiosk) {
        current.kiosk.district = normalizeDistrict(msg.payload.district);
      }
      SLOTS.forEach((slot) => {
        send(current[slot]?.ws, { type: 'state', sessionId, payload: msg.payload ?? {} });
      });
    } else if (msg.type === 'state' && role === 'mobile' && joinedSlot) {
      const payload = msg.payload ?? {};
      const peer = current[joinedSlot];
      if (peer && (payload.type === 'plant_drawing' || payload.type === 'plant_sent')) {
        peer.plantEvents = { ...(peer.plantEvents || {}), [payload.type]: payload };
      }
      send(current.kiosk?.ws, { type: 'state', sessionId, slot: joinedSlot, payload });
    }
  });

  ws.on('close', () => {
    if (claimTimer) clearTimeout(claimTimer);
    const current = rooms.get(sessionId);
    if (!current) return;
    if (role === 'kiosk' && current.kiosk?.ws === ws) {
      delete current.kiosk;
      SLOTS.forEach((slot) => {
        send(current[slot]?.ws, { type: 'peer_left', sessionId, role: 'kiosk' });
      });
    } else if (joinedSlot && current[joinedSlot]?.ws === ws) {
      current[joinedSlot].ws = null;
    }
    scheduleIdleCleanup(sessionId);
  });
}

module.exports = { attachMobileLinkClient };
