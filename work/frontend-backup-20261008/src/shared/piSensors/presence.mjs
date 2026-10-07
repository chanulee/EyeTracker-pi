// Tracking requires a detected pupil, not merely a powered camera or socket.
export function trackedPlayers(diag, now) {
  return ['A', 'B'].filter(key => diag?.[key]?.face && !diag[key].stale
    && Number.isFinite(diag[key].received) && now - diag[key].received < 350);
}
