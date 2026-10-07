export const F_TOTAL_DURATION = 7000;
export const F_DURATION_MS = F_TOTAL_DURATION;
export const S_DURATION_MS = 5000;
export const F_FRAME_COUNT = 9;

let rouletteAnimationId = null;

// 처음엔 빠르게 지나가고, 끝으로 갈수록 한 칸이 길어지며 멈춘다.
function easeOutSpin(t) {
  return 1 - (1 - t) ** 2;
}

// 뽑힌 지역 로고가 가운데 칸(4)에 오도록 맞춘다.
export function rouletteOffsetForLogo(logoIndex) {
  const count = ROULETTE_LOGOS.length;
  return (logoIndex - 4 + count) % count;
}

export function startRoulette(onOffset, onComplete, targetOffset = 0) {
  const startedAt = performance.now();
  const travelMs = F_TOTAL_DURATION * 0.9;
  const endOffset = targetOffset + ROULETTE_LOGOS.length;
  let finished = false;

  function animate(now) {
    const elapsed = now - startedAt;
    const t = Math.min(elapsed / travelMs, 1);
    onOffset(easeOutSpin(t) * endOffset);

    if (t < 1) {
      rouletteAnimationId = requestAnimationFrame(animate);
      return;
    }

    if (!finished) {
      finished = true;
      onOffset(endOffset);
      if (onComplete) onComplete(endOffset);
    }
  }

  onOffset(0);
  rouletteAnimationId = requestAnimationFrame(animate);
}

export function stopRoulette() {
  if (rouletteAnimationId) {
    cancelAnimationFrame(rouletteAnimationId);
    rouletteAnimationId = null;
  }
}

export const STAGE = {
  width: 3881,
  height: 2183,
};

// f_001 왼쪽 → 오른쪽. 로고는 호를 따라 왼쪽으로 한 칸씩 이동하고, 가운데만 커지며 자기 색이 난다.
// f_002 가운데는 352가 아니라 355(종로)라서, 352가 가운데를 지날 때만 centerSrc로 바뀐다.
export const ROULETTE_LOGOS = [
  {
    src: '/3/logo-eunpyeong-gray.png',
    centerSrc: '/3/logo-eunpyeong.png',
    texture: '/3/circle-f006.svg',
    stack: true,
    cover: true,
    side: { x: 19, y: 20, w: 52, h: 51 },
    center: { x: 37, y: 39, w: 101, h: 98 },
  },
  {
    src: '/3/logo-images.png',
    centerSrc: '/3/logo-360.png',
    texture: '/3/circle-f007.svg',
    side: { x: 13, y: 26, w: 69, h: 43 },
    center: { x: 8, y: 38, w: 159, h: 112 },
  },
  {
    src: '/3/logo-r800.png',
    centerSrc: '/3/mark-mapo.png',
    texture: '/3/circle-f008.svg',
    stack: true,
    centerCrop: { width: '153.85%', height: '234.12%', top: '0', left: '0' },
    sidePosition: 'bottom',
    side: { x: 5, y: 30, w: 86, h: 35 },
    center: { x: 17, y: 55, w: 142, h: 58 },
  },
  {
    src: '/3/logo-173.png',
    centerSrc: '/3/logo-361.png',
    texture: '/3/circle-f009.svg',
    sidePosition: 'bottom',
    side: { x: 20, y: 22, w: 56, h: 51 },
    center: { x: 28, y: 36, w: 120, h: 110 },
  },
  {
    src: '/3/logo-eb.png',
    texture: '/3/circle-f001.svg',
    badge: '/3/badge-f001.png',
    side: { x: 8, y: 29, w: 80, h: 37 },
    center: { x: 16, y: 55, w: 144, h: 66 },
  },
  {
    src: '/3/logo-352.png',
    centerSrc: '/3/logo-355.png',
    texture: '/3/circle-f002.svg',
    badge: '/3/badge-f002.png',
    sidePosition: 'bottom',
    full: true,
    side: { x: 16, y: 29, w: 64, h: 37 },
    center: { x: -13, y: 42, w: 201, h: 84 },
  },
  {
    src: '/3/logo-350.png',
    texture: '/3/circle-f003.svg',
    badge: '/3/badge-f003.png',
    side: { x: 13, y: 23, w: 70, h: 41 },
    center: { x: 24, y: 42, w: 127, h: 74 },
  },
  {
    src: '/3/logo-732.png',
    texture: '/3/circle-f004.svg',
    badge: '/3/badge-f004.png',
    side: { x: 22, y: 24, w: 52, h: 48 },
    center: { x: 31, y: 35, w: 115, h: 107 },
  },
  {
    src: '/3/logo-1120.png',
    texture: '/3/circle-f005.svg',
    badge: '/3/badge-f005.png',
    side: { x: 20, y: 21, w: 56, h: 53 },
    center: { x: 32, y: 36, w: 111, h: 104 },
  },
];

export function textureForLogo(src) {
  const found = ROULETTE_LOGOS.find((logo) => logo.src === src || logo.centerSrc === src);
  return found ? found.texture : '';
}

// x, y는 대지 기준 원의 왼쪽 위. img는 원 안쪽 로고 박스.
export const LOGO_SLOTS = [
  { x: 195, y: 338, opacity: 0.37, chip: 0.25, img: { x: 19, y: 20, w: 52, h: 51 } },
  { x: 566, y: 266, opacity: 0.52, chip: 0.4, img: { x: 13, y: 26, w: 69, h: 43 } },
  { x: 958, y: 200, opacity: 0.73, chip: 0.55, img: { x: 5, y: 30, w: 86, h: 35 } },
  { x: 1372, y: 155, opacity: 0.65, chip: 0.66, img: { x: 20, y: 22, w: 56, h: 51 } },
  { x: 1853, y: 100, center: true, img: { x: 16, y: 55, w: 144, h: 66 } },
  { x: 2414, y: 155, opacity: 0.73, chip: 0.66, img: { x: 16, y: 29, w: 64, h: 37 } },
  { x: 2828, y: 200, opacity: 0.65, chip: 0.55, img: { x: 13, y: 23, w: 70, h: 41 } },
  { x: 3220, y: 266, opacity: 0.52, chip: 0.4, img: { x: 22, y: 24, w: 52, h: 48 } },
  { x: 3591, y: 338, opacity: 0.37, chip: 0.25, img: { x: 20, y: 21, w: 56, h: 53 } },
];

export const DISTRICTS = [
  {
    id: 1,
    name: '종로구',
    logo: '/3/logo-355.png',
    logoIndex: 5,
    centerMark: {
      src: '/3/mark-jongno.png',
      texture: '/3/texture-jongno.svg',
      x: -0.5,
      y: 58,
      w: 201,
      h: 84,
    },
    glow: { x: 2607, y: 977 },
    lines: [
      '종로구는 오래된 도심의 좁은 골목과 다양한 가로공간이 이어져 있어, 공간에 맞는 ',
      '녹지 조성이 중요하기 때문에 좁은 공간에서도 자랄 수 있는 식물이 필요해요.',
    ],
  },
  {
    id: 4,
    name: '마포구',
    logo: '/3/logo-r800.png',
    logoIndex: 2,
    centerMark: {
      src: '/3/mark-mapo.png',
      texture: '/3/texture-mapo.svg',
      x: 19.4,
      y: 62.8,
      w: 162.2,
      h: 66.2,
      crop: { width: '153.85%', height: '234.12%' },
    },
    glow: { x: 2364, y: 1089 },
    lines: [
      '마포구는 유동인구가 많은 도심의 보행공간에 가로수가 조성되어 있지만, ',
      '폭염에 대응하는 도시숲을 마련하기 위한 다양한 층위의 녹지와 주변을 채우는 식물이 필요해요.',
    ],
  },
  {
    id: 6,
    name: '강남구',
    logo: '/3/logo-gangnam.png',
    logoIndex: 7,
    centerMark: {
      src: '/3/mark-gangnam.png',
      disc: '/3/texture-gangnam.svg',
      x: 43.4,
      y: 46.5,
      w: 115.2,
      h: 107,
    },
    glow: { x: 2942, y: 1414 },
    lines: [
      '강남구는 빌딩이 밀집한 도심의 보행공간에서 그늘과 녹지가 부족한 구간이 있기 때문에, ',
      '그늘을 만드는 나무와 도심의 빈틈을 채울 수 있는 식물이 필요해요.',
    ],
  },
];

export function districtIndexForLandedOffset(offset) {
  const count = ROULETTE_LOGOS.length;
  const logoIndex = ((4 + Math.round(offset)) % count + count) % count;
  const index = DISTRICTS.findIndex((item) => item.logoIndex === logoIndex);
  return index >= 0 ? index : 0;
}

function slotPoint(slot) {
  const size = slot.center ? 175 : 95;
  return {
    cx: slot.x + size / 2,
    cy: slot.y + size / 2,
    chip: slot.center ? 1 : slot.chip,
    imgOpacity: slot.center ? 1 : slot.opacity,
  };
}

function withCenterBloom(point, slotPos, logo) {
  const distance = Math.abs(slotPos - 4);
  const near = Math.max(0, 1 - distance / 0.55);
  const glow = near * near * (3 - 2 * near);
  const mix = (from, to) => from + (to - from) * glow;
  const size = 95 + (175 - 95) * glow;
  const sideScale = size / 95;
  const centerScale = size / 175;
  return {
    x: point.cx - size / 2,
    y: point.cy - size / 2,
    size,
    glow,
    fade: point.fade,
    chip: mix(point.chip, 1),
    imgOpacity: mix(point.imgOpacity, 1),
    swap: logo.centerSrc ? glow : 0,
    imgX: mix(logo.side.x * sideScale, logo.center.x * centerScale),
    imgY: mix(logo.side.y * sideScale, logo.center.y * centerScale),
    imgW: mix(logo.side.w * sideScale, logo.center.w * centerScale),
    imgH: mix(logo.side.h * sideScale, logo.center.h * centerScale),
  };
}

function mod(value, count) {
  return ((value % count) + count) % count;
}

// offset 0은 f_001, 8은 f_009. 로고는 호를 따라 왼쪽으로 미끄러진다.
export function placementForLogo(logoIndex, offset) {
  const count = LOGO_SLOTS.length;
  const logo = ROULETTE_LOGOS[logoIndex];
  const base = Math.floor(offset);
  const t = offset - base;
  const fromSlot = mod(logoIndex - base, count);
  const toSlot = mod(fromSlot - 1, count);

  let slotPos = fromSlot;
  let fade = 1;
  if (fromSlot === 0 && toSlot === count - 1) {
    if (t < 0.5) {
      slotPos = 0;
      fade = 1 - t * 2;
    } else {
      slotPos = count - 1;
      fade = (t - 0.5) * 2;
    }
  } else {
    slotPos = fromSlot + (toSlot - fromSlot) * t;
  }

  const index = Math.min(count - 1, Math.floor(slotPos));
  const u = slotPos - index;
  const from = slotPoint(LOGO_SLOTS[index]);
  const to = slotPoint(LOGO_SLOTS[Math.min(count - 1, index + 1)]);
  const mix = (start, end) => start + (end - start) * u;
  return withCenterBloom(
    {
      cx: mix(from.cx, to.cx),
      cy: mix(from.cy, to.cy),
      chip: mix(from.chip, to.chip),
      imgOpacity: mix(from.imgOpacity, to.imgOpacity),
      fade,
    },
    slotPos,
    logo
  );
}
