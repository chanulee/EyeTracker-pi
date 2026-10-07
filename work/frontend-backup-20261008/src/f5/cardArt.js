/**
 * 자치구별 식물 도감 카드. 슬롯 A가 왼쪽(NABI), B가 오른쪽(SORA).
 * 디자인·연출은 세 자치구가 같고 가운데 식물 사진만 다르다.
 * 하단 박스와 글자는 화면에서 직접 그려야 해서, 그 부분을 들어낸 -base 를 쓴다.
 */
const CARD_ART = {
  종로구: [
    { slot: 'A', art: 'jongno-1' },
    { slot: 'B', art: 'jongno-2' },
  ],
  마포구: [
    { slot: 'A', art: 'mapo-1' },
    { slot: 'B', art: 'mapo-2' },
  ],
  강남구: [
    { slot: 'A', art: 'gangnam-1' },
    { slot: 'B', art: 'gangnam-2' },
  ],
};

export function cardsFor(district) {
  return CARD_ART[district] || [];
}

export function cardFor(district, slot) {
  return cardsFor(district).find((card) => card.slot === slot) || null;
}

/*
 * 카드 그림을 고쳐도 폰에는 예전에 받아 둔 파일이 그대로 뜬다. 주소가 같으면 다시 받지 않는다.
 * 그림을 손볼 때마다 이 숫자를 올리면 폰이 새 파일로 본다.
 */
const ART_VERSION = 2;

export function cardArtUrl(art, { base = false } = {}) {
  return `/5/cards/${art}${base ? '-base' : ''}.svg?v=${ART_VERSION}`;
}

export const CARD_SIZE = { width: 505, height: 769 };

// 폰에서 이름을 아직 안 적었을 때 카드에 들어가는 기본 이름.
const FALLBACK_NAMES = { A: 'NABI', B: 'SORA' };

export function plantNameFor(slot, names) {
  const typed = (names?.[slot] || '').trim();
  return typed || FALLBACK_NAMES[slot] || '';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 카드에 찍히는 날짜. 원래 디자인과 같은 'Sep. 27. 2026' 꼴. */
export function formatCardDate(date = new Date()) {
  return `${MONTHS[date.getMonth()]}. ${date.getDate()}. ${date.getFullYear()}`;
}
