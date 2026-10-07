/** http(LAN) 등에서 randomUUID 미지원 시 대체 */
export function createMobileSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
