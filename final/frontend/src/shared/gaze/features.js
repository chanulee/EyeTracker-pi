// MediaPipe FaceLandmarker 결과 -> 시선 회귀용 특징 벡터.
// 핵심 아이디어: 홍채 중심을 눈꺼풀/눈꼬리 기준 좌표계로 정규화하고,
// 머리 자세(yaw/pitch/roll)와 얼굴 위치/거리를 함께 넣어 회귀가 보상하도록 한다.

// upper/lower 는 눈꺼풀 정점 한 점만 쓰면 프레임마다 튀어서, 정점 주변 3점을 평균한다.
export const LM = {
  right: {
    outer: 33,
    inner: 133,
    top: 159,
    bottom: 145,
    upper: [160, 159, 158],
    lower: [144, 145, 153],
    iris: 468,
    ring: [469, 470, 471, 472],
  },
  left: {
    outer: 263,
    inner: 362,
    top: 386,
    bottom: 374,
    upper: [387, 386, 385],
    lower: [373, 374, 380],
    iris: 473,
    ring: [474, 475, 476, 477],
  },
  nose: 1,
  chin: 152,
  forehead: 10,
  cheekL: 234,
  cheekR: 454,
};

function meanPoint(lm, indices, aspect) {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const i of indices) {
    const p = lm[i];
    if (!p) continue;
    x += p.x * aspect;
    y += p.y;
    n += 1;
  }
  return n ? { x: x / n, y: y / n } : null;
}

function eyeFeature(lm, spec, aspect) {
  const outer = lm[spec.outer];
  const inner = lm[spec.inner];
  const iris = lm[spec.iris];
  if (!outer || !inner || !iris) return null;

  const upper = meanPoint(lm, spec.upper, aspect);
  const lower = meanPoint(lm, spec.lower, aspect);
  if (!upper || !lower) return null;

  const O = { x: outer.x * aspect, y: outer.y };
  const I = { x: inner.x * aspect, y: inner.y };

  // 눈꼬리 두 점을 잇는 축을 기준으로 한 로컬 좌표계 (롤 회전 보상)
  const ax = I.x - O.x;
  const ay = I.y - O.y;
  const width = Math.hypot(ax, ay) || 1e-6;
  const ux = ax / width;
  const uy = ay / width;

  const cx = (O.x + I.x) / 2;
  const cy = (O.y + I.y) / 2;
  const local = (p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return { h: dx * ux + dy * uy, v: -dx * uy + dy * ux };
  };

  // 홍채 중심 랜드마크 하나만 쓰면 지터가 그대로 들어오므로 ring 4점까지 함께 평균한다.
  const ring = spec.ring.map((i) => lm[i]).filter(Boolean);
  const center = {
    x: (iris.x * aspect + ring.reduce((a, p) => a + p.x * aspect, 0)) / (1 + ring.length),
    y: (iris.y + ring.reduce((a, p) => a + p.y, 0)) / (1 + ring.length),
  };

  const pIris = local(center);
  const pUpper = local(upper);
  const pLower = local(lower);

  let radius = 0;
  for (const p of ring) radius += Math.hypot(p.x * aspect - center.x, p.y - center.y);
  radius = ring.length ? radius / ring.length : 0;

  // 위/아래 눈꺼풀 사이에서 홍채가 차지하는 상대 위치.
  // v/width 는 가로폭(약 30mm)으로 나눠 수직 해상도가 낮은데, 이 값은 눈 높이(약 10mm)
  // 기준이라 같은 시선 변화에 3배가량 크게 반응한다.
  const span = pLower.v - pUpper.v;
  const lid = Math.abs(span) > 1e-6 ? (pIris.v - pUpper.v) / span : 0.5;

  return {
    h: pIris.h / width, // 눈 축 방향(좌우)
    v: pIris.v / width, // 수직 방향
    lid,
    // 눈꺼풀 간격도 눈 축에 수직인 성분만 재서 롤 회전에 흔들리지 않게 한다.
    openness: Math.abs(span) / width,
    width,
    radius: radius / width,
  };
}

export function eulerFromMatrix(data) {
  // MediaPipe facialTransformationMatrix 는 column-major 4x4
  const r = (i, j) => data[j * 4 + i];
  const sy = Math.hypot(r(0, 0), r(1, 0));
  if (sy < 1e-6) {
    return { pitch: Math.atan2(-r(1, 2), r(1, 1)), yaw: Math.atan2(-r(2, 0), sy), roll: 0 };
  }
  return {
    pitch: Math.atan2(r(2, 1), r(2, 2)),
    yaw: Math.atan2(-r(2, 0), sy),
    roll: Math.atan2(r(1, 0), r(0, 0)),
  };
}

/**
 * @param {Array<{x:number,y:number,z:number}>} lm 정규화 랜드마크 (478개)
 * @param {Float32Array|number[]|null} matrix facialTransformationMatrix data
 * @param {number} aspect videoWidth / videoHeight
 */
export function extractFeatures(lm, matrix, aspect = 1) {
  if (!lm || lm.length < 478) return null;
  const right = eyeFeature(lm, LM.right, aspect);
  const left = eyeFeature(lm, LM.left, aspect);
  if (!right || !left) return null;

  const cheekL = lm[LM.cheekL];
  const cheekR = lm[LM.cheekR];
  const forehead = lm[LM.forehead];
  const chin = lm[LM.chin];
  const nose = lm[LM.nose];

  const faceW = Math.hypot((cheekR.x - cheekL.x) * aspect, cheekR.y - cheekL.y) || 1e-6;
  const faceH = Math.hypot((chin.x - forehead.x) * aspect, chin.y - forehead.y) || 1e-6;

  let yaw = ((nose.x - (cheekL.x + cheekR.x) / 2) * aspect) / faceW;
  let pitch = (nose.y - (forehead.y + chin.y) / 2) / faceH;
  let roll = Math.atan2(cheekR.y - cheekL.y, (cheekR.x - cheekL.x) * aspect);
  let tz = 0;

  if (matrix && matrix.length >= 16) {
    const e = eulerFromMatrix(matrix);
    yaw = e.yaw;
    pitch = e.pitch;
    roll = e.roll;
    tz = matrix[14] / 100;
  }

  const hx = (left.h + right.h) / 2;
  const hy = (left.v + right.v) / 2;
  const lid = (left.lid + right.lid) / 2;
  const irisR = (left.radius + right.radius) / 2;
  const openness = (left.openness + right.openness) / 2;

  return {
    hx,
    hy,
    lid,
    irisR,
    left,
    right,
    yaw,
    pitch,
    roll,
    tz,
    openness,
    faceW,
    faceCx: nose.x * aspect,
    faceCy: nose.y,
  };
}

/**
 * 사람 한 명의 회귀 입력 벡터 (0번은 bias).
 * 양쪽 홍채의 중간점(hx, hy)을 주 신호로 쓰고, 좌/우 차이를 보조 특징으로 넣는다.
 *
 * 좌/우 값을 절대값으로 넣으면 hx = (left.h + right.h) / 2 라서 hx 가 다른 두 열의
 * 정확한 선형 결합이 된다. 설계행렬이 특이해져 정규화가 약할 때 발산하므로,
 * 중간점은 hx/hy 로만 두고 좌/우는 차이값으로 넣는다.
 */
export function gazeVector(f) {
  return [
    1,
    f.hx,
    f.hy,
    f.lid,
    f.left.h - f.right.h,
    f.left.v - f.right.v,
    f.yaw,
    f.pitch,
    f.roll,
    f.faceCx,
    f.faceCy,
    f.faceW,
    f.tz,
    f.irisR,
    f.hx * f.hx,
    f.hy * f.hy,
    f.hx * f.hy,
    f.hx * f.yaw,
    f.hy * f.pitch,
  ];
}