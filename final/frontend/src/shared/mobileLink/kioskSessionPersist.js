const KIOSK_SESSION_KEY = 'seoul-mobile-kiosk-session';

/**
 * @returns {{ sessionId: string, districtName?: string } | null}
 */
export function readPersistedKioskSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KIOSK_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const sessionId = typeof parsed?.sessionId === 'string' ? parsed.sessionId.trim() : '';
    if (!sessionId) return null;
    const districtName =
      typeof parsed?.districtName === 'string' ? parsed.districtName.trim() : '';
    return { sessionId, districtName };
  } catch {
    return null;
  }
}

/**
 * @param {string} sessionId
 * @param {{ name?: string } | null | undefined} district
 */
export function persistKioskSession(sessionId, district) {
  if (typeof window === 'undefined' || !sessionId) return;
  try {
    sessionStorage.setItem(
      KIOSK_SESSION_KEY,
      JSON.stringify({
        sessionId,
        districtName: typeof district?.name === 'string' ? district.name.trim() : '',
      })
    );
  } catch {
    /* ignore */
  }
}

export function clearPersistedKioskSession() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(KIOSK_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
