/**
 * @param {'mobile' | 'width' | 'contain' | 'cover'} fit
 */
export function computeMobileStageScale(w, h, artboardWidth, artboardHeight, fit = 'contain') {
  if (!w || !h || !artboardWidth || !artboardHeight) return 1;

  const sx = w / artboardWidth;
  const sy = h / artboardHeight;

  if (fit === 'mobile') {
    if (sx > sy) {
      return h >= artboardHeight * sx ? sx : sy;
    }
    return sy >= sx ? sx : sy;
  }
  if (fit === 'width') return sx;
  if (fit === 'cover') return Math.max(sx, sy);
  return Math.min(sx, sy);
}
