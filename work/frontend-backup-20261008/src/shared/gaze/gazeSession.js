const KEY = 'seoul-gaze-session';

export function loadGazeSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveGazeSession(patch) {
  if (typeof window === 'undefined') return;
  try {
    const prev = loadGazeSession() || {};
    sessionStorage.setItem(KEY, JSON.stringify({ ...prev, ...patch }));
  } catch {
    // 저장이 거절돼도 현재 탭의 추적 자체는 계속한다.
  }
}

export function clearGazeSession() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
