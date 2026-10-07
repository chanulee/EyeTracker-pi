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
