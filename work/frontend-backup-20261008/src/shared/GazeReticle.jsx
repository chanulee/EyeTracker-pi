import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './GazeReticle.module.css';

// 캔버스 한 변(CSS px). 구름이 가장 넓게 퍼졌을 때도 잘리지 않을 크기.
export const RETICLE_SIZE = 260;

/* ───────── 디자인 조절값 ─────────
 * 전부 여기서만 바꾸면 된다. 아래 그리기 코드는 이 값만 읽는다.
 */
// 점 배치: 동심원 고리. 고리 수와 안쪽 첫 고리의 점 수(바깥 고리로 갈수록 그 배수).
// 총 점 개수 = DOTS_PER_RING × (1 + 2 + … + RINGS). 기본 6 × 15 = 90.
// 나선(해바라기) 배열은 커졌다 작아질 때 회전 착시가 생겨서 쓰지 않는다.
const RINGS = 5;
const DOTS_PER_RING = 6;
// 점 크기(px, 반지름). 가장 작을 때 기준이며 퍼지면 DOT_GROW 만큼 커진다.
const DOT_SIZE = 1.3;
const DOT_GROW = 0.25;
// 한 번 숨 쉬는 시간(ms): 촘촘한 구슬 → 퍼짐 → 다시 구슬.
const BREATH_MS = 9000;
// 반지름(px): 가장 촘촘할 때와 가장 퍼졌을 때. 차이가 작을수록 덜 퍼진다.
const RADIUS_TIGHT = 24;
const RADIUS_WIDE = 40;
// 회전 속도(rad/s). 0 이면 돌지 않는다. 0.1 이면 한 바퀴에 약 1분.
const SPIN = 0.1;
// 흐트러짐 세기(반지름 대비). 0 이면 흐트러지지 않고 크기만 변한다.
const TURBULENCE = 0.4;
// 파동이 흐르는 속도 배율. 작을수록 꿈틀거림이 느리다.
const WAVE_SPEED = 0.5;
// 빛무리 세기(0~1).
const HALO = 0.19;
// 가운데 핵 glow 반지름(px).
const CORE_GLOW = 26;
// 한 곳을 응시(dwell)할수록 구름이 얼마나 오므라드는지(0~1). 0 이면 응시해도 숨쉬기가 그대로다.
const DWELL_SHRINK = 0.8;
// 응시 게이지: 12시에서 시계 방향으로 차오르는 호. 반지름(px)·두께(px).
const GAUGE_RADIUS = 32;
const GAUGE_WIDTH = 2.5;
// 시선 좌표를 바로 쓰지 않고 이 시간상수로 따라간다. 클수록 더 느리고 자석처럼 붙는다.
const FOLLOW_TAU_MS = 160;
/* ──────────────────────────────── */

function smoothstep(from, to, value) {
  const x = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return x * x * (3 - 2 * x);
}

// 점 배치와 점마다 고정된 난수(위상·세기). 매 프레임 같은 값을 써야 떨리지 않는다.
function seedDots() {
  let s = 1234567;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const dots = [];
  for (let ring = 1; ring <= RINGS; ring += 1) {
    const count = DOTS_PER_RING * ring;
    // 고리마다 반 칸씩 엇갈려 놓아 방사형 줄무늬가 생기지 않게 한다.
    const offset = ring % 2 ? 0 : Math.PI / count;
    for (let k = 0; k < count; k += 1) {
      dots.push({
        unit: ring / RINGS, // 0~1, 안쪽일수록 작다
        angle: offset + (k / count) * Math.PI * 2,
        p1: rand() * Math.PI * 2,
        gain: 0.7 + rand() * 0.3,
      });
    }
  }
  return dots;
}

// CSS 색을 캔버스가 정규화한 값(#rrggbb 또는 rgba())으로 읽어 투명도만 바꾼다.
function withAlpha(ctx, color, alpha) {
  if (!color) return `rgba(255, 255, 255, ${alpha})`;
  ctx.fillStyle = color;
  const normalized = String(ctx.fillStyle);
  const hex = normalized.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const value = parseInt(hex[1], 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }
  const rgb = normalized.match(/rgba?\(([^)]+)\)/);
  if (rgb) {
    const [r, g, b] = rgb[1].split(',').map((part) => parseFloat(part));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(255, 255, 255, ${alpha})`;
}

function drawCloud(ctx, dots, now, color, dwell) {
  const half = RETICLE_SIZE / 2;
  const t = now / 1000;
  const phase = (now % BREATH_MS) / BREATH_MS;
  // 0 = 촘촘, 1 = 가장 퍼짐. 응시 중(dwell)일수록 구슬 쪽으로 모인다.
  // 코사인에 smoothstep 을 한 번 더 얹어 양 끝(가장 작을 때·클 때)에서 잠시 머문다.
  const wave = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
  const breath = smoothstep(0, 1, wave) * (1 - dwell * DWELL_SHRINK);
  const radius = RADIUS_TIGHT + (RADIUS_WIDE - RADIUS_TIGHT) * breath;
  // 흐트러짐은 커지거나 작아지는 도중(중간 크기)에 가장 크고, 가장 작을 때·가장 클 때는 정돈된 구슬이 된다.
  const transit = 4 * breath * (1 - breath);
  // 바닥값 0.3: 가장 작을 때·클 때도 완전히 정돈되진 않고 살짝 불규칙하다.
  const turbulence = (0.3 + 0.7 * transit * transit) * TURBULENCE * radius;
  const spin = t * SPIN;
  const w = t * WAVE_SPEED;

  ctx.clearRect(0, 0, RETICLE_SIZE, RETICLE_SIZE);
  const tintSoft = withAlpha(ctx, color, HALO * 0.7);
  const tintCore = withAlpha(ctx, color, 0.3);
  const clear = withAlpha(ctx, color, 0);

  // 1) 구름 전체를 감싸는 은은한 빛무리.
  const haloRadius = radius * 1.25 + 14;
  const halo = ctx.createRadialGradient(half, half, 0, half, half, haloRadius);
  halo.addColorStop(0, withAlpha(ctx, color, HALO));
  halo.addColorStop(0.55, tintSoft);
  halo.addColorStop(1, clear);
  ctx.globalAlpha = 1;
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(half, half, haloRadius, 0, Math.PI * 2);
  ctx.fill();

  // 2) 점 구름.
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < dots.length; i += 1) {
    const d = dots[i];
    // 안쪽 고리는 그대로 두고, 바깥 고리로 갈수록 흐트러짐이 커진다.
    const edge = smoothstep(0.35, 1, d.unit);
    const wobble = turbulence * edge * edge * d.gain;
    const a0 = d.angle;
    // 각도·반지름에 대한 낮은 주파수의 파동이라 이웃한 점이 같이 움직여 물결·갈래 모양이 난다.
    // 공간항과 시간항을 곱(정상파)으로 두어 제자리에서 출렁일 뿐 빙빙 돌지 않는다.
    const lobe = 1 + transit * 0.08 * Math.sin(a0 * 3) * Math.sin(w * 1.5) * edge;
    const f1 = Math.sin(a0 * 2) * Math.cos(d.unit * 5) * Math.sin(w * 0.9);
    const f2 = Math.cos(a0 * 3) * Math.sin(d.unit * 4) * Math.cos(w * 1.1);
    const ripple = Math.sin(a0 * 5 + d.unit * 7 + d.p1) * Math.sin(w * 1.7 + d.p1);
    const r = radius * d.unit * lobe;
    const a = a0 + spin;
    const x = half + Math.cos(a) * r + (f1 * 0.85 + ripple * 0.25) * wobble;
    const y = half + Math.sin(a) * r + (f2 * 0.85 + ripple * 0.25) * wobble;
    const size = (DOT_SIZE + breath * DOT_GROW) * (1.2 - d.unit * 0.4);
    const alpha = (0.9 - d.unit * 0.45) * (1 - breath * 0.2);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3) 가운데 밝은 핵. 참가자 색은 여기 번짐에 쓴다.
  const coreGlow = CORE_GLOW + dwell * 12;
  const glow = ctx.createRadialGradient(half, half, 0, half, half, coreGlow);
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  glow.addColorStop(0.25, tintCore);
  glow.addColorStop(1, clear);
  ctx.globalAlpha = 1;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(half, half, coreGlow, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(half, half, 3.4 + dwell * 1.2, 0, Math.PI * 2);
  ctx.fill();

  // 4) 응시 게이지. 응시가 시작되면 12시부터 시계 방향으로 호가 차오르고, 끝나면 사라진다.
  if (dwell > 0.01) {
    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * dwell;
    ctx.lineCap = 'round';
    ctx.lineWidth = GAUGE_WIDTH;
    // 바탕 트랙(아주 옅게) + 채워진 호(흰색).
    ctx.strokeStyle = withAlpha(ctx, color, 0.25);
    ctx.beginPath();
    ctx.arc(half, half, GAUGE_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(half, half, GAUGE_RADIUS, start, end);
    ctx.stroke();
  }
}

/**
 * 시선 커서. 동심원 고리로 놓인 점 구름이 숨 쉬듯 모였다 퍼진다.
 *
 * gazeRef + viewerId 가 있으면 매 프레임 ref 를 읽어 위치를 옮긴다 (2인 동시 표시).
 * position 만 있으면 예전 1인 경로로도 동작한다.
 *
 * visible 은 켜고 끄는 스위치(끄면 아예 그리지 않는다).
 * shown 은 부드럽게 나타나고 사라지는 용도다. false 로 두면 위치 추적은 계속하면서
 * 구름만 서서히 사라진다(CSS 트랜지션). 연출 중 특정 구간에만 보여 줄 때 쓴다.
 */
export default function GazeReticle({
  gazeRef,
  viewerId,
  position = null,
  dwellProgress = 0,
  visible = true,
  shown = true,
  color,
}) {
  const elRef = useRef(null);
  const canvasRef = useRef(null);
  const followRef = useRef(null);
  const dwellRef = useRef(dwellProgress);
  dwellRef.current = dwellProgress;
  const colorRef = useRef(color);
  colorRef.current = color;
  const dots = useMemo(seedDots, []);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return undefined;
    // visible=false 면 DOM 이 없다(elRef 가 null). 그때 등록하면 같은 viewerId 로 렌더 중인
    // 다른 커서(예: /5 는 페이지가 직접 띄운다)의 등록을 null 로 덮어써 위치 갱신이 끊긴다.
    if (!visible) return undefined;

    const runtime = window.__seoulGazeRuntime || (window.__seoulGazeRuntime = {});
    if (!runtime.cursors) runtime.cursors = {};

    // 1인 시절 API 와 2인 map 을 같이 유지한다.
    if (viewerId) runtime.cursors[viewerId] = elRef.current;
    else runtime.cursorEl = elRef.current;

    if (elRef.current && position) {
      elRef.current.style.left = `${position.x}px`;
      elRef.current.style.top = `${position.y}px`;
    }

    return () => {
      if (viewerId && runtime.cursors?.[viewerId] === elRef.current) {
        delete runtime.cursors[viewerId];
      }
      if (!viewerId && runtime.cursorEl === elRef.current) {
        runtime.cursorEl = null;
      }
    };
  }, [mounted, position, viewerId, visible]);

  // 그리기와 위치 갱신을 한 루프에서 한다.
  useEffect(() => {
    if (!mounted || !visible) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = RETICLE_SIZE * ratio;
    canvas.height = RETICLE_SIZE * ratio;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#ffffff';

    let rafId;
    const loop = (now) => {
      rafId = requestAnimationFrame(loop);
      const el = elRef.current;
      if (!el) return;

      if (gazeRef && viewerId) {
        const gaze = gazeRef.current?.[viewerId];
        if (!gaze) {
          el.style.opacity = '0';
          followRef.current = null;
          return;
        }
        el.style.opacity = '1';
        const prev = followRef.current;
        if (!prev) {
          followRef.current = { x: gaze.x, y: gaze.y, t: now };
        } else {
          const dt = Math.min(48, Math.max(0, now - prev.t));
          const k = 1 - Math.exp(-dt / FOLLOW_TAU_MS);
          prev.x += (gaze.x - prev.x) * k;
          prev.y += (gaze.y - prev.y) * k;
          prev.t = now;
        }
        el.style.left = `${followRef.current.x}px`;
        el.style.top = `${followRef.current.y}px`;
      }

      ctx.fillStyle = '#ffffff';
      drawCloud(ctx, dots, now, colorRef.current, Math.max(0, Math.min(1, dwellRef.current)));
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [mounted, visible, gazeRef, viewerId, dots]);

  if (!mounted || !visible) return null;

  const x = position?.x ?? (typeof window !== 'undefined' ? window.innerWidth / 2 : 0);
  const y = position?.y ?? (typeof window !== 'undefined' ? window.innerHeight / 2 : 0);

  return createPortal(
    <div
      ref={elRef}
      className={styles.reticle}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        ...(color ? { '--reticle-tint': color } : null),
      }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className={`${styles.canvas} ${shown ? '' : styles.canvasOff}`} />
    </div>,
    document.body
  );
}
