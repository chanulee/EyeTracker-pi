export function normalizedQuaternion(value) {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isFinite)) return null;
  const length = Math.hypot(...value);
  return length > 0.001 ? value.map(v => v / length) : null;
}

export function relativeLook(value, neutral, yawGain = 1, pitchGain = 1) {
  const q = normalizedQuaternion(value), n = normalizedQuaternion(neutral);
  if (!q || !n) return null;
  const [a, b, c, d] = [-n[0], -n[1], -n[2], n[3]], [x, y, z, w] = q;
  const rx = d*x + a*w + b*z - c*y, ry = d*y - a*z + b*w + c*x;
  const rz = d*z + a*y - b*x + c*w, rw = d*w - a*x - b*y - c*z;
  const yaw = Math.atan2(2*(rw*rz + rx*ry), 1 - 2*(ry*ry + rz*rz));
  const pitch = Math.asin(Math.max(-1, Math.min(1, 2*(rw*ry - rz*rx))));
  return { yaw: Math.max(-100, Math.min(100, yaw * 180/Math.PI * yawGain)) * Math.PI/180,
    pitch: Math.max(-32, Math.min(32, pitch * 180/Math.PI * pitchGain)) * Math.PI/180 };
}

export function freshImu(packet, now) {
  return Boolean(packet?.connected && packet.imu?.status === 'ok'
    && Number.isFinite(packet.receivedAt) && now - packet.receivedAt < 750
    && Number.isFinite(packet.imu.age) && packet.imu.age >= 0 && packet.imu.age < 0.75);
}

// Three seconds of steady, fresh packets define this wearer's forward direction.
export function collectNeutral(state, packet, now) {
  const q = freshImu(packet, now) && normalizedQuaternion(packet.imu.q);
  if (!q) { state.window = null; return null; }
  let window = state.window;
  if (window?.last === packet.receivedAt) return null;
  const dot = window ? q.reduce((sum, v, i) => sum + v * window.anchor[i], 0) : 1;
  const angle = 2 * Math.acos(Math.min(1, Math.abs(dot)));
  if (!window || packet.receivedAt - window.last > 750 || angle > 5 * Math.PI / 180) {
    window = state.window = { anchor: q, sum: [0, 0, 0, 0], start: packet.receivedAt, last: null, count: 0 };
  }
  const sign = q.reduce((sum, v, i) => sum + v * window.anchor[i], 0) < 0 ? -1 : 1;
  q.forEach((v, i) => { window.sum[i] += sign * v; });
  window.last = packet.receivedAt;
  window.count++;
  return window.last - window.start >= 3000 && window.count >= 10 ? normalizedQuaternion(window.sum) : null;
}

// Both sides must be observed for 200ms; elapsed time alone never finishes the introduction.
export function observeTurns(state, packet, neutral, now) {
  if (!freshImu(packet, now)) { state.side = null; return false; }
  if (state.last === packet.receivedAt) return Boolean(state.left && state.right);
  if (state.last != null && packet.receivedAt - state.last > 750) state.side = null;
  state.last = packet.receivedAt;
  const look = relativeLook(packet.imu.q, neutral);
  if (!look) { state.side = null; return false; }
  const side = look.yaw < -Math.PI / 12 ? 'left' : look.yaw > Math.PI / 12 ? 'right' : null;
  if (side !== state.side) { state.side = side; state.since = packet.receivedAt; }
  if (side && packet.receivedAt - state.since >= 200) state[side] = true;
  return Boolean(state.left && state.right);
}
