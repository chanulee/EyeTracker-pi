/** @typedef {{ id: string, image: string, scale?: number, rotate?: number, offsetY?: number, objectPosition?: string }} EndPlantVariant */

// 자치구마다 식물 두 개만 쓴다. 슬롯 A(첫 번째 참가자)가 앞의 것, 슬롯 B(두 번째 참가자)가 뒤의 것.
// 쓰지 않는 에셋: jongno-c, mapo-a, gangnam-c (public/mobile/plants, public/4/plants 에 파일은 남아 있다).

/** @type {Record<string, EndPlantVariant>} */
export const END_PLANT_VARIANTS = {
  'jongno-a': {
    id: 'jongno-a',
    image: '/mobile/plants/jongno-a.png',
    scale: 1,
    objectPosition: 'center center',
  },
  'jongno-b': {
    id: 'jongno-b',
    image: '/mobile/plants/jongno-b.png',
    scale: 1,
    objectPosition: 'center center',
  },
  'mapo-b': {
    id: 'mapo-b',
    image: '/mobile/plants/mapo-b.png',
    scale: 1,
    objectPosition: 'center center',
  },
  'mapo-c': {
    id: 'mapo-c',
    image: '/mobile/plants/mapo-c.png',
    scale: 1,
    objectPosition: 'center center',
  },
  'gangnam-a': {
    id: 'gangnam-a',
    image: '/mobile/plants/gangnam-a.png',
    scale: 1,
    objectPosition: 'center center',
  },
  'gangnam-b': {
    id: 'gangnam-b',
    image: '/mobile/plants/gangnam-b.png',
    scale: 1,
    objectPosition: 'center center',
  },
};

/** 자치구별 [슬롯 A 식물, 슬롯 B 식물]. */
const PAIR_BY_DISTRICT = {
  종로구: ['jongno-a', 'jongno-b'],
  마포구: ['mapo-b', 'mapo-c'],
  강남구: ['gangnam-a', 'gangnam-b'],
};

const DEFAULT_PAIR = PAIR_BY_DISTRICT.종로구;

/**
 * 슬롯 A 는 항상 첫 번째 식물, 슬롯 B 는 항상 두 번째 식물을 받는다. 그래서 둘은 겹치지 않는다.
 * 슬롯을 모르면(짝이 안 맺어진 상태) A 쪽 식물을 쓴다.
 * @param {string} districtName
 * @param {{ sessionId?: string | null, slot?: 'A' | 'B' | null }} [link]
 * @returns {EndPlantVariant}
 */
export function pickEndPlantVariant(districtName, link = {}) {
  const pair = PAIR_BY_DISTRICT[districtName] ?? DEFAULT_PAIR;
  return END_PLANT_VARIANTS[pair[link?.slot === 'B' ? 1 : 0]];
}
