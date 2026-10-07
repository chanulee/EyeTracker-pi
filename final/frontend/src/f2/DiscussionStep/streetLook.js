const DEG = Math.PI / 180;

// 거리 사진은 200도 범위로 둘러본다. 사이트 줌의 최대 광각은 화각 84도다.
export const YAW_LIMIT = 100 * DEG;
export const PITCH_LIMIT = 32 * DEG;
export const MAX_FOV = 84 * DEG;

export function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

export function viewFov(aspect) {
  const cap = 2 * Math.atan(Math.tan(52.5 * DEG) / Math.max(aspect, 0.2));
  return Math.min(MAX_FOV, cap);
}

function rotX(v, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]];
}

function rotY(v, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]];
}

export function lookFromPointer(nx, ny) {
  return {
    yaw: clamp((nx - 0.5) * 2 * YAW_LIMIT, -YAW_LIMIT, YAW_LIMIT),
    pitch: clamp((0.5 - ny) * 2 * PITCH_LIMIT, -PITCH_LIMIT, PITCH_LIMIT),
  };
}

export function screenToWorld(nx, ny, yaw, pitch, fov, aspect) {
  const px = nx * 2 - 1;
  const py = (1 - ny) * 2 - 1;
  const t = Math.tan(fov * 0.5);
  let ray = [px * aspect * t, py * t, 1];
  const len = Math.hypot(ray[0], ray[1], ray[2]) || 1;
  ray = [ray[0] / len, ray[1] / len, ray[2] / len];
  ray = rotX(ray, pitch);
  ray = rotY(ray, yaw);
  return ray;
}

export function worldToScreen(dir, yaw, pitch, fov, aspect) {
  let ray = rotY(dir, -yaw);
  ray = rotX(ray, -pitch);
  if (ray[2] <= 0.08) return null;
  const t = Math.tan(fov * 0.5);
  const px = ray[0] / (ray[2] * aspect * t);
  const py = ray[1] / (ray[2] * t);
  if (px < -1.08 || px > 1.08 || py < -1.08 || py > 1.08) return null;
  return { x: (px + 1) / 2, y: (1 - py) / 2 };
}
