import { useCallback, useEffect, useRef, useState } from 'react';
import { CARD_SIZE, cardArtUrl, cardFor, formatCardDate, plantNameFor } from '../f5/cardArt';
import {
  CARD_FONT,
  DATE_TEXT,
  DISTRICT_TEXT,
  NAME_TEXT,
  PANEL_FILL_SMALL,
  PANEL_GRADIENT_SMALL,
  PANEL_SMALL,
  TEXT_COLOR_SMALL,
} from '../f5/cardPanelPaths';
import MobileCardArt from './MobileCardArt';
import styles from './MobileCardPage.module.css';

// 카드 속 그림이 원본 해상도(가로 843px 이상)라 2배로 내보내면 또렷하게 남는다.
const EXPORT_SCALE = 2;

// SVG를 목표 크기로 키워 <img>로 띄운다. 원래 크기로 먼저 래스터화되면 키울 때 흐려진다.
async function loadCardArt(url, width, height) {
  const source = await fetch(url).then((res) => {
    if (!res.ok) throw new Error('카드 파일을 불러오지 못했습니다.');
    return res.text();
  });
  const sized = source
    .replace(/(<svg[^>]*?)\swidth="[^"]*"/, `$1 width="${width}"`)
    .replace(/(<svg[^>]*?)\sheight="[^"]*"/, `$1 height="${height}"`);

  const blobUrl = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = blobUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/*
 * 저장용 PNG는 화면과 같은 값으로 캔버스에 다시 그린다.
 * SVG 안의 <text>는 이미지로 띄우는 순간 웹폰트를 못 써서, 글자만 캔버스로 올린다.
 */
async function renderCardPng(art, district, plantName, date, scale) {
  const width = Math.round(CARD_SIZE.width * scale);
  const height = Math.round(CARD_SIZE.height * scale);
  const image = await loadCardArt(cardArtUrl(art, { base: true }), width, height);
  await document.fonts?.ready;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, width, height);

  // 이제부터는 카드 원본 좌표(505×769)로 그린다.
  ctx.scale(scale, scale);

  ctx.textAlign = 'left';
  ctx.fillStyle = 'white';
  ctx.font = `${DISTRICT_TEXT.fontWeight} ${DISTRICT_TEXT.fontSize}px ${CARD_FONT}`;
  // letterSpacing 은 아직 못 받는 브라우저가 있다. 없으면 0.9px 정도 넓어질 뿐이라 그냥 둔다.
  ctx.letterSpacing = `${DISTRICT_TEXT.letterSpacing}px`;
  ctx.fillText(district, DISTRICT_TEXT.x, DISTRICT_TEXT.baseline);
  ctx.letterSpacing = '0px';

  const panel = new Path2D(PANEL_SMALL);
  ctx.fillStyle = `rgba(255, 255, 255, ${PANEL_FILL_SMALL})`;
  ctx.fill(panel);
  const fade = ctx.createLinearGradient(
    PANEL_GRADIENT_SMALL.x1,
    PANEL_GRADIENT_SMALL.y1,
    PANEL_GRADIENT_SMALL.x2,
    PANEL_GRADIENT_SMALL.y2
  );
  fade.addColorStop(0.334801, 'rgba(255, 255, 255, 0)');
  fade.addColorStop(1, 'rgba(255, 255, 255, 1)');
  ctx.fillStyle = fade;
  ctx.fill(panel);

  ctx.textAlign = 'center';
  ctx.fillStyle = TEXT_COLOR_SMALL;
  ctx.globalAlpha = 0.9;

  let nameSize = NAME_TEXT.fontSize;
  ctx.font = `${NAME_TEXT.fontWeight} ${nameSize}px ${CARD_FONT}`;
  const nameWidth = ctx.measureText(plantName).width;
  if (nameWidth > NAME_TEXT.maxWidth) {
    nameSize = (nameSize * NAME_TEXT.maxWidth) / nameWidth;
    ctx.font = `${NAME_TEXT.fontWeight} ${nameSize}px ${CARD_FONT}`;
  }
  ctx.fillText(plantName, NAME_TEXT.x, NAME_TEXT.baseline);

  ctx.font = `${DATE_TEXT.fontWeight} ${DATE_TEXT.fontSize}px ${CARD_FONT}`;
  ctx.fillText(date, DATE_TEXT.x, DATE_TEXT.baseline);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('이미지를 만들지 못했습니다.'))),
      'image/png'
    );
  });
}

// iOS는 공유 시트의 "이미지 저장"이 사진첩에 넣는 길이고, 안드로이드는 바로 내려받는다.
async function saveBlob(blob, fileName) {
  const file = new File([blob], fileName, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '식물 도감 카드' });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'idle';
    }
  }

  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 10000);
  return 'saved';
}

export default function MobileCardPage({ district, slot, name, ready }) {
  const card = ready ? cardFor(district, slot) : null;
  const plantName = plantNameFor(slot, { [slot]: name });
  const [status, setStatus] = useState('idle');
  // 키오스크와 같은 날짜가 찍히도록 열어 본 날을 쓴다.
  const [date, setDate] = useState('');
  // 저장 버튼 폭을 카드와 맞춘다. 카드는 남는 높이에 눌려 폭이 정해지므로 재어 봐야 안다.
  const cardRef = useRef(null);
  const cardBoxRef = useRef(null);
  const [cardWidth, setCardWidth] = useState(0);

  useEffect(() => {
    setDate(formatCardDate());
  }, []);

  useEffect(() => {
    const box = cardBoxRef.current;
    if (!box) return undefined;
    const measure = () => {
      const node = cardRef.current;
      if (node) setCardWidth(node.getBoundingClientRect().width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [card]);

  const handleSave = useCallback(async () => {
    if (!card) return;
    setStatus('working');
    try {
      const blob = await renderCardPng(card.art, district, plantName, date, EXPORT_SCALE);
      setStatus(await saveBlob(blob, `plant-your-seoul-${card.art}.png`));
    } catch {
      setStatus('error');
    }
  }, [card, district, plantName, date]);

  if (!ready) {
    return <div className={styles.page} />;
  }

  if (!card) {
    return (
      <div className={styles.page}>
        <p className={styles.notice}>카드를 찾지 못했어요. 키오스크 화면의 QR을 다시 찍어 주세요.</p>
      </div>
    );
  }

  return (
    <div
      className={styles.page}
      style={cardWidth ? { '--card-width': `${cardWidth}px` } : undefined}
    >
      <header className={styles.head}>
        <p className={styles.district}>{district}</p>
        <h1 className={styles.title}>식물 도감 카드</h1>
      </header>
      <div className={styles.cardBox} ref={cardBoxRef}>
        <MobileCardArt
          ref={cardRef}
          className={styles.card}
          art={card.art}
          district={district}
          plantName={plantName}
          date={date}
        />
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={status === 'working'}
        >
          <span className={styles.saveLabel}>
            {status === 'working' ? '저장하는 중…' : '카드 저장하기'}
          </span>
        </button>
        <p className={styles.hint} role="status">
          {status === 'saved' ? '다운로드 폴더에 저장했어요.' : null}
          {status === 'shared' ? '공유 시트에서 "이미지 저장"을 눌러 주세요.' : null}
          {status === 'error' ? '저장에 실패했어요. 잠시 뒤 다시 눌러 주세요.' : null}
          {status === 'idle' || status === 'working'
            ? '저장한 카드는 사진첩에서 다시 볼 수 있어요.'
            : null}
        </p>
      </div>
    </div>
  );
}
