/** @typedef {{ strong?: boolean, text: string }} MobileLeadPart */
/** @typedef {{ parts: MobileLeadPart[] }} MobileLeadLine */

/** @typedef {{ loadingLead: string, drawingLeadLines: MobileLeadLine[], tags: string[] }} MobileDistrictCopy */

/** 기본 fallback 카피 (종로구 등) */
export const DEFAULT_MOBILE_DISTRICT_COPY = {
  loadingLead: '나만의 식물을 그려볼 준비, 되셨나요?',
  drawingLeadLines: [
    {
      parts: [
        { strong: true, text: '녹지 가득한 {name}' },
        { text: '를 만들기 위해' },
      ],
    },
    { parts: [{ text: '나만의 식물을 자유롭게 그려주세요' }] },
  ],
  tags: ['균형', '힐링', '편안함'],
};

/** @type {Record<string, Partial<MobileDistrictCopy>>} */
const MOBILE_DISTRICT_COPY_BY_NAME = {
  종로구: {
    drawingLeadLines: [
      { parts: [{ text: '오래된 도심과 좁은 길목이 가득한 종로구를 위해' }] },
      { parts: [{ text: '식물을 자유롭게 그려주세요' }] },
    ],
    tags: ['균형', '힐링', '편안함'],
  },
  마포구: {
    drawingLeadLines: [
      { parts: [{ text: '유동 인구가 많은 마포구를 위해' }] },
      { parts: [{ text: '나만의 식물을 자유롭게 그려주세요' }] },
    ],
    tags: ['맑은 공기', '쾌적한', '시원함'],
  },
  강남구: {
    drawingLeadLines: [
      { parts: [{ text: '빌딩 숲 사이로 틈새 식물이 가득한 강남구를 만들기 위해' }] },
      { parts: [{ text: '식물을 자유롭게 그려주세요' }] },
    ],
    tags: ['맑음', '청량함', '휴식'],
  },
};

function interpolateName(text, districtName) {
  return text.replace(/\{name\}/g, districtName);
}

/**
 * @param {string} districtName
 * @returns {MobileDistrictCopy}
 */
export function resolveMobileDistrictCopy(districtName) {
  const override = MOBILE_DISTRICT_COPY_BY_NAME[districtName];
  const merged = {
    loadingLead: override?.loadingLead ?? DEFAULT_MOBILE_DISTRICT_COPY.loadingLead,
    drawingLeadLines:
      override?.drawingLeadLines ?? DEFAULT_MOBILE_DISTRICT_COPY.drawingLeadLines,
    tags: override?.tags ?? DEFAULT_MOBILE_DISTRICT_COPY.tags,
  };

  return {
    ...merged,
    drawingLeadLines: merged.drawingLeadLines.map((line) => ({
      parts: line.parts.map((part) => ({
        ...part,
        text: interpolateName(part.text, districtName),
      })),
    })),
  };
}

/** 컴포넌트 단독 렌더 시 기본값 (종로구 카피) */
export const DEFAULT_MOBILE_DISTRICT_COPY_RESOLVED = resolveMobileDistrictCopy('종로구');
