export function pointFromPacket(packet, size) {
  if (!packet.valid || !Number.isFinite(packet.x) || !Number.isFinite(packet.y) || !Number.isFinite(packet.frame_age_ms) || packet.frame_age_ms > 350) return null;
  if (packet.calibration_viewport && (packet.calibration_viewport.width !== size.width || packet.calibration_viewport.height !== size.height)) return null;
  return { x: Math.max(0, Math.min(1, packet.x)) * size.width, y: Math.max(0, Math.min(1, packet.y)) * size.height };
}
