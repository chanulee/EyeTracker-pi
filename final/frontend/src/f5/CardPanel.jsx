import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import DynamicQrCode from '../shared/mobileLink/DynamicQrCode';
import { formatCardDate } from './cardArt';
import DistrictLabel from './DistrictLabel';
import {
  CARD_FONT,
  CARD_VIEWBOX,
  DATE_SHIFT,
  DATE_TEXT,
  NAME_TEXT,
  PANEL_FILL_SMALL,
  PANEL_FILL_TALL,
  PANEL_GRADIENT_SMALL,
  PANEL_GRADIENT_TALL,
  PANEL_SMALL,
  PANEL_TALL,
  QR_SLOT,
  QR_TEXT_LINES,
  TEXT_COLOR_SMALL,
  TEXT_COLOR_TALL,
} from './cardPanelPaths';
import styles from './PlantCards.module.css';

// 작은 박스가 위로 자라는 시간.
const PANEL_MS = 1100;
// 식물 이름이 빠지는 시간. 박스가 자라기 시작할 때 같이 사라진다.
const NAME_MS = 450;
// 박스가 거의 자리잡은 뒤에 QR과 안내 문구가 들어온다.
export const QR_DELAY_MS = 950;
const QR_MS = 800;
const TOTAL_MS = QR_DELAY_MS + QR_MS;

const NUMBER = /-?\d*\.?\d+/g;
const PANEL_PARTS = PANEL_SMALL.split(NUMBER);
const PANEL_FROM = (PANEL_SMALL.match(NUMBER) || []).map(Number);
const PANEL_TO = (PANEL_TALL.match(NUMBER) || []).map(Number);
// 두 패널은 세그먼트 구성이 같아야 숫자만 바꿔 끼울 수 있다. 어긋나면 모양을 통째로 교체한다.
const MORPHABLE =
  PANEL_FROM.length === PANEL_TO.length &&
  PANEL_SMALL.replace(NUMBER, '') === PANEL_TALL.replace(NUMBER, '');

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function mix(from, to, t) {
  return from + (to - from) * t;
}

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function mixColor(from, to, t) {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const channel = (shift) => Math.round(mix((a >> shift) & 255, (b >> shift) & 255, t));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

function panelPath(t) {
  if (!MORPHABLE) return t > 0.5 ? PANEL_TALL : PANEL_SMALL;
  let out = PANEL_PARTS[0];
  for (let i = 0; i < PANEL_FROM.length; i += 1) {
    out += Math.round(mix(PANEL_FROM[i], PANEL_TO[i], t) * 1000) / 1000 + PANEL_PARTS[i + 1];
  }
  return out;
}

function percent(value, total) {
  return `${(value / total) * 100}%`;
}

/** 폰에서 적어 온 이름은 길이가 제각각이라, 카드 폭을 넘으면 글자를 줄인다. */
function useFittedText(ref, text) {
  useLayoutEffect(() => {
    let alive = true;
    const fit = () => {
      const node = alive ? ref.current : null;
      if (!node) return;
      node.style.fontSize = `${NAME_TEXT.fontSize}px`;
      const width = node.getComputedTextLength();
      if (width > NAME_TEXT.maxWidth) {
        node.style.fontSize = `${(NAME_TEXT.fontSize * NAME_TEXT.maxWidth) / width}px`;
      }
    };
    fit();
    // 웹폰트가 늦게 올라오면 폭이 달라지므로 한 번 더 맞춘다.
    document.fonts?.ready?.then(fit);
    return () => {
      alive = false;
    };
  }, [ref, text]);
}

/**
 * 카드 위에 겹쳐 그리는 글자 층. 아래쪽 흰 박스는 grown 이 켜지면 위로 자라면서
 * 식물 이름이 빠지고 그 자리에 QR과 안내 문구가 들어온다. 오른쪽 위 자치구 이름은
 * 그대로 머문다. 배경 그림은 /5/cards/*-base.svg 가 따로 그린다.
 */
export default function CardPanel({ id, district, plantName, grown, qrUrl }) {
  // 날짜는 켜질 때마다 오늘로. 서버와 시간대가 어긋나도 화면이 흔들리지 않게 붙은 뒤에 넣는다.
  const [today, setToday] = useState('');
  const nameRef = useRef(null);
  const fillRef = useRef(null);
  const sheenRef = useRef(null);
  const fadeRef = useRef(null);
  const dateRef = useRef(null);
  const qrTextRef = useRef(null);
  const qrSlotRef = useRef(null);
  useFittedText(nameRef, plantName);

  useEffect(() => {
    setToday(formatCardDate());
  }, []);

  /*
   * 박스가 자라는 동안은 리액트를 거치지 않고 바뀌는 속성만 DOM 에 직접 적는다.
   * 프레임마다 다시 그리면 긴 path 문자열까지 매번 비교돼 커지는 동작이 끊긴다.
   */
  const paint = useCallback((elapsed) => {
    const panelT = easeInOut(clamp01(elapsed / PANEL_MS));
    const nameT = clamp01(elapsed / NAME_MS);
    const qrT = clamp01((elapsed - QR_DELAY_MS) / QR_MS);
    const shape = panelPath(panelT);

    const fill = fillRef.current;
    if (fill) {
      fill.setAttribute('d', shape);
      fill.setAttribute('fill-opacity', mix(PANEL_FILL_SMALL, PANEL_FILL_TALL, panelT));
    }
    sheenRef.current?.setAttribute('d', shape);

    const fade = fadeRef.current;
    if (fade) {
      fade.setAttribute('x1', mix(PANEL_GRADIENT_SMALL.x1, PANEL_GRADIENT_TALL.x1, panelT));
      fade.setAttribute('y1', mix(PANEL_GRADIENT_SMALL.y1, PANEL_GRADIENT_TALL.y1, panelT));
      fade.setAttribute('x2', mix(PANEL_GRADIENT_SMALL.x2, PANEL_GRADIENT_TALL.x2, panelT));
      fade.setAttribute('y2', mix(PANEL_GRADIENT_SMALL.y2, PANEL_GRADIENT_TALL.y2, panelT));
    }

    nameRef.current?.setAttribute('fill-opacity', 0.9 * (1 - nameT));

    const date = dateRef.current;
    if (date) {
      date.setAttribute('transform', `translate(${DATE_SHIFT.x * panelT} ${DATE_SHIFT.y * panelT})`);
      date.setAttribute('fill', mixColor(TEXT_COLOR_SMALL, TEXT_COLOR_TALL, panelT));
    }

    // QR 과 안내 문구는 박스가 다 자란 뒤에 들어온다. 투명도만 0 으로 두면 큰 글자 path 와
    // 섞기 모드(multiply) 칸이 자라는 내내 같이 합성되므로, 보일 때까지 아예 빼 둔다.
    const shown = qrT > 0 ? '' : 'none';
    const qrText = qrTextRef.current;
    if (qrText) {
      qrText.setAttribute('fill-opacity', 0.9 * qrT);
      qrText.style.display = shown;
    }
    const slot = qrSlotRef.current;
    if (slot) {
      slot.style.opacity = qrT;
      slot.style.display = shown;
    }
  }, []);

  useLayoutEffect(() => {
    if (!grown) {
      paint(0);
      return undefined;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now) => {
      const next = now - start;
      paint(Math.min(TOTAL_MS, next));
      if (next < TOTAL_MS) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [grown, paint]);

  const gradientId = `cardPanelFade-${id}`;

  return (
    <div className={styles.panelLayer}>
      <svg
        className={styles.panel}
        viewBox={`0 0 ${CARD_VIEWBOX.width} ${CARD_VIEWBOX.height}`}
        fill="none"
        aria-hidden
      >
        <defs>
          <linearGradient
            ref={fadeRef}
            id={gradientId}
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
        <DistrictLabel district={district} />
        <path ref={fillRef} d={PANEL_SMALL} fill="white" fillOpacity={PANEL_FILL_SMALL} />
        <path ref={sheenRef} d={PANEL_SMALL} fill={`url(#${gradientId})`} />
        <text
          ref={nameRef}
          x={NAME_TEXT.x}
          y={NAME_TEXT.baseline}
          textAnchor="middle"
          fontFamily={CARD_FONT}
          fontSize={NAME_TEXT.fontSize}
          fontWeight={NAME_TEXT.fontWeight}
          fill={TEXT_COLOR_SMALL}
          fillOpacity={0.9}
        >
          {plantName}
        </text>
        <text
          ref={dateRef}
          x={DATE_TEXT.x}
          y={DATE_TEXT.baseline}
          textAnchor="middle"
          fontFamily={CARD_FONT}
          fontSize={DATE_TEXT.fontSize}
          fontWeight={DATE_TEXT.fontWeight}
          fill={TEXT_COLOR_SMALL}
          fillOpacity="0.9"
        >
          {today}
        </text>
        <g ref={qrTextRef} fill={TEXT_COLOR_TALL} fillOpacity={0} style={{ display: 'none' }}>
          {QR_TEXT_LINES.map((line) => (
            <path key={line.y} d={line.d} transform={`translate(${line.x} ${line.y})`} />
          ))}
        </g>
      </svg>
      <div
        ref={qrSlotRef}
        className={styles.qrSlot}
        style={{
          left: percent(QR_SLOT.x, CARD_VIEWBOX.width),
          top: percent(QR_SLOT.y, CARD_VIEWBOX.height),
          width: percent(QR_SLOT.width, CARD_VIEWBOX.width),
          height: percent(QR_SLOT.height, CARD_VIEWBOX.height),
          opacity: 0,
          display: 'none',
        }}
      >
        <DynamicQrCode url={qrUrl} alt="식물 도감 카드 받기" />
      </div>
    </div>
  );
}
