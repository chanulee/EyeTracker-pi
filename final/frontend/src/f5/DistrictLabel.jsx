import { CARD_FONT, DISTRICT_TEXT } from './cardPanelPaths';

/** 카드 오른쪽 위, 핀 아이콘 옆에 붙는 자치구 이름. 키오스크와 폰이 같은 값을 쓴다. */
export default function DistrictLabel({ district }) {
  if (!district) return null;
  return (
    <text
      x={DISTRICT_TEXT.x}
      y={DISTRICT_TEXT.baseline}
      fontFamily={CARD_FONT}
      fontSize={DISTRICT_TEXT.fontSize}
      fontWeight={DISTRICT_TEXT.fontWeight}
      letterSpacing={DISTRICT_TEXT.letterSpacing}
      fill="white"
    >
      {district}
    </text>
  );
}
