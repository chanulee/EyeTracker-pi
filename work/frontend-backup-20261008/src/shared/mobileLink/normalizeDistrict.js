/** @typedef {{ name: string, id?: number, logoIndex?: number }} LinkDistrict */

/**
 * @param {LinkDistrict | string | null | undefined} raw
 * @returns {LinkDistrict | null}
 */
export function normalizeLinkDistrict(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const name = raw.trim();
    return name ? { name } : null;
  }
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  return name ? { ...raw, name } : null;
}
