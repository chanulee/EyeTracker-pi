import { forwardRef, useLayoutEffect, useRef } from 'react';
import { CARD_SIZE, cardArtUrl } from '../f5/cardArt';
import DistrictLabel from '../f5/DistrictLabel';
import {
  CARD_FONT,
  DATE_TEXT,
  NAME_TEXT,
  PANEL_FILL_SMALL,
  PANEL_GRADIENT_SMALL,
  PANEL_SMALL,
  TEXT_COLOR_SMALL,
} from '../f5/cardPanelPaths';

/**
 * 폰에서 보는 카드 한 장. 배경 그림과 하단 박스·글자를 한 SVG 안에 담아
 * 크기만 바꿔도 글자 위치가 어긋나지 않는다. 저장용 PNG도 같은 값으로 그린다.
 */
const MobileCardArt = forwardRef(function MobileCardArt(
  { art, district, plantName, date, className },
  ref
) {
  const nameRef = useRef(null);

  useLayoutEffect(() => {
    let alive = true;
    const fit = () => {
      const node = alive ? nameRef.current : null;
      if (!node) return;
      node.style.fontSize = `${NAME_TEXT.fontSize}px`;
      const width = node.getComputedTextLength();
      if (width > NAME_TEXT.maxWidth) {
        node.style.fontSize = `${(NAME_TEXT.fontSize * NAME_TEXT.maxWidth) / width}px`;
      }
    };
    fit();
    document.fonts?.ready?.then(fit);
    return () => {
      alive = false;
    };
  }, [plantName]);

  return (
    <svg
      ref={ref}
      className={className}
      width={CARD_SIZE.width}
      height={CARD_SIZE.height}
      viewBox={`0 0 ${CARD_SIZE.width} ${CARD_SIZE.height}`}
      fill="none"
      role="img"
      aria-label={`${plantName} 식물 도감 카드`}
    >
      <defs>
        <linearGradient
          id="mobileCardPanelFade"
          x1={PANEL_GRADIENT_SMALL.x1}
          y1={PANEL_GRADIENT_SMALL.y1}
          x2={PANEL_GRADIENT_SMALL.x2}
          y2={PANEL_GRADIENT_SMALL.y2}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.334801" stopColor="white" stopOpacity="0" />
          <stop offset="1" stopColor="white" />
        </linearGradient>
      </defs>
      <image
        href={cardArtUrl(art, { base: true })}
        x="0"
        y="0"
        width={CARD_SIZE.width}
        height={CARD_SIZE.height}
      />
      <DistrictLabel district={district} />
      <path d={PANEL_SMALL} fill="white" fillOpacity={PANEL_FILL_SMALL} />
      <path d={PANEL_SMALL} fill="url(#mobileCardPanelFade)" />
      <text
        ref={nameRef}
        x={NAME_TEXT.x}
        y={NAME_TEXT.baseline}
        textAnchor="middle"
        fontFamily={CARD_FONT}
        fontSize={NAME_TEXT.fontSize}
        fontWeight={NAME_TEXT.fontWeight}
        fill={TEXT_COLOR_SMALL}
        fillOpacity="0.9"
      >
        {plantName}
      </text>
      <text
        x={DATE_TEXT.x}
        y={DATE_TEXT.baseline}
        textAnchor="middle"
        fontFamily={CARD_FONT}
        fontSize={DATE_TEXT.fontSize}
        fontWeight={DATE_TEXT.fontWeight}
        fill={TEXT_COLOR_SMALL}
        fillOpacity="0.9"
      >
        {date}
      </text>
    </svg>
  );
});

export default MobileCardArt;
