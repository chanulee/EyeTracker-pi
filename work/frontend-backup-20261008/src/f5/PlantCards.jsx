import { useEffect, useState } from 'react';
import { cardArtUrl, cardsFor, plantNameFor } from './cardArt';
import CardPanel, { QR_DELAY_MS } from './CardPanel';
import styles from './PlantCards.module.css';

// 카드가 다 떠오를 때까지(.cardLayerOn 의 지연 + 전환).
const APPEAR_MS = 1500;
// 다 보이고 나서 기다리는 숨.
const HOLD_MS = 3000;
// 도는 시간. CSS .spinnerSpun 의 transition 과 맞춘다.
const SPIN_MS = 1800;
// 거의 멈춘 참에 박스가 자라기 시작해야 두 동작이 이어진다.
const GROW_LEAD_MS = 250;

// 카드마다 다른 주소를 들려 보낸다. 폰에서 이 주소를 열면 그 슬롯 카드를 받는다.
// 이름도 같이 실어 보내야 폰에서 받는 카드에 같은 이름이 찍힌다.
function cardUrlFor(joinUrl, district, slot, plantName) {
  if (!joinUrl) return '';
  try {
    const url = new URL(joinUrl);
    url.pathname = '/mobile/card';
    url.searchParams.set('district', district);
    url.searchParams.set('slot', slot);
    if (plantName) url.searchParams.set('name', plantName);
    return url.toString();
  } catch {
    return '';
  }
}

export default function PlantCards({ visible, district, qrUrl, plantNames }) {
  const cards = cardsFor(district);
  const [spinning, setSpinning] = useState(false);
  const [grown, setGrown] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSpinning(false);
      setGrown(false);
      setRevealed(false);
      return undefined;
    }
    const spinAt = APPEAR_MS + HOLD_MS;
    const growAt = spinAt + SPIN_MS - GROW_LEAD_MS;
    const spin = window.setTimeout(() => setSpinning(true), spinAt);
    const grow = window.setTimeout(() => setGrown(true), growAt);
    // 카드에 QR이 떠오르는 순간에 맞춰 화면 전체 막과 아래 문구도 같이 들어온다.
    const reveal = window.setTimeout(() => setRevealed(true), growAt + QR_DELAY_MS);
    return () => {
      window.clearTimeout(spin);
      window.clearTimeout(grow);
      window.clearTimeout(reveal);
    };
  }, [visible]);

  if (!cards.length) return null;

  return (
    <>
      <div className={`${styles.mistLayer} ${revealed ? styles.mistOn : ''}`} />
      <div className={`${styles.cardLayer} ${visible ? styles.cardLayerOn : ''}`}>
        {cards.map((card) => {
          const art = cardArtUrl(card.art, { base: true });
          const name = plantNameFor(card.slot, plantNames);
          return (
            <div key={card.art} className={styles.cardSlot}>
              <div className={`${styles.spinner} ${spinning ? styles.spinnerSpun : ''}`}>
                <div className={styles.face}>
                  <img className={styles.cardArt} src={art} alt="" />
                  <CardPanel
                    id={`${card.art}-front`}
                    district={district}
                    plantName={name}
                    grown={grown}
                    qrUrl={cardUrlFor(qrUrl, district, card.slot, name)}
                  />
                </div>
                {/* 도는 동안 보이는 뒷면. 같은 그림을 쓰므로 글자가 뒤집혀 보이지 않는다. */}
                <div className={`${styles.face} ${styles.faceBack}`}>
                  <img className={styles.cardArt} src={art} alt="" />
                  <CardPanel
                    id={`${card.art}-back`}
                    district={district}
                    plantName={name}
                    grown={false}
                    qrUrl=""
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <img
        className={`${styles.caption} ${revealed ? styles.captionOn : ''}`}
        src="/5/cards/qr-caption.svg"
        alt=""
      />
    </>
  );
}
