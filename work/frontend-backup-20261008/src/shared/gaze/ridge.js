// 캘리브레이션 샘플 -> 화면 좌표 매핑을 위한 릿지 회귀.
// 특징 차원이 작아서(<32) 정규방정식 + 가우스 소거로 충분하다.

// 보정할 때 고개를 고정하면 머리 자세 특징(yaw/pitch/roll, 얼굴 위치·거리)의 분산이
// 거의 0이 된다. 그 상태로 표준화하면 아주 작은 std 로 나누게 되어, 사용 중에 고개를
// 조금만 움직여도 z 가 수백 배로 튀고 예측이 화면 밖으로 발산한다(커서가 시선과 무관하게
// 튀어다님). 학습 구간을 크게 벗어난 입력은 어차피 신뢰할 수 없으므로 이 범위로 자른다.
// 정상 입력은 대부분 |z| < 3 이라 평소 예측에는 영향이 없다.
const Z_LIMIT = 4;

function standardize(mean, std, x, c) {
  if (c === 0) return 1; // bias
  const z = (x[c] - mean[c]) / std[c];
  return Math.min(Math.max(z, -Z_LIMIT), Z_LIMIT);
}

function solve(A, B) {
  const n = A.length;
  const k = B[0].length;
  const M = A.map((row, i) => [...row, ...B[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) continue;
    if (pivot !== col) {
      const tmp = M[pivot];
      M[pivot] = M[col];
      M[col] = tmp;
    }
    const d = M[col][col];
    for (let c = col; c < n + k; c += 1) M[col][c] /= d;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = col; c < n + k; c += 1) M[r][c] -= f * M[col][c];
    }
  }

  return M.map((row) => row.slice(n));
}

/**
 * @param {number[][]} X n x d (0번 열은 bias=1 가정)
 * @param {number[][]} Y n x k
 * @param {number} lambda 정규화 계수 (표준화된 특징 기준)
 * @returns {{ mean:number[], std:number[], W:number[][] }}
 */
export function fitRidge(X, Y, lambda = 1e-3) {
  const n = X.length;
  const d = X[0].length;
  const k = Y[0].length;

  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(1);
  for (let c = 1; c < d; c += 1) {
    let s = 0;
    for (let i = 0; i < n; i += 1) s += X[i][c];
    mean[c] = s / n;
    let v = 0;
    for (let i = 0; i < n; i += 1) v += (X[i][c] - mean[c]) ** 2;
    std[c] = Math.sqrt(v / n) || 1;
  }

  // 학습과 추론이 같은 변환을 쓰도록 여기서도 같은 범위로 자른다.
  const Z = X.map((row) => row.map((val, c) => standardize(mean, std, row, c)));

  const A = Array.from({ length: d }, () => new Array(d).fill(0));
  const B = Array.from({ length: d }, () => new Array(k).fill(0));
  for (let i = 0; i < n; i += 1) {
    const z = Z[i];
    for (let a = 0; a < d; a += 1) {
      for (let b = a; b < d; b += 1) A[a][b] += z[a] * z[b];
      for (let c = 0; c < k; c += 1) B[a][c] += z[a] * Y[i][c];
    }
  }
  for (let a = 0; a < d; a += 1) {
    for (let b = 0; b < a; b += 1) A[a][b] = A[b][a];
  }
  for (let a = 1; a < d; a += 1) A[a][a] += lambda * n;

  const W = solve(A, B);
  return { mean, std, W };
}

export function predictRidge(model, x) {
  const { mean, std, W } = model;
  const d = W.length;
  const k = W[0].length;
  const out = new Array(k).fill(0);
  for (let c = 0; c < d; c += 1) {
    const z = standardize(mean, std, x, c);
    for (let j = 0; j < k; j += 1) out[j] += z * W[c][j];
  }
  return out;
}

/**
 * 입력이 보정 때 본 분포에서 얼마나 벗어났는지 (표준편차 배수의 최대값).
 * Z_LIMIT 을 넘으면 그 특징은 잘려서 예측에 반영되지 않는다는 뜻이라, 자세가 보정 때와
 * 달라졌는지 진단하는 데 쓴다.
 */
export function featureDeviation(model, x) {
  const { mean, std, W } = model;
  let max = 0;
  for (let c = 1; c < W.length; c += 1) {
    const z = Math.abs((x[c] - mean[c]) / std[c]);
    if (z > max) max = z;
  }
  return max;
}

/**
 * 잔차가 큰 샘플(깜빡임 직전, 한눈판 프레임)을 한 번 걸러내고 재학습한다.
 * @returns {{ model:object, X:number[][], Y:number[][] }} 실제 학습에 쓰인 데이터와 모델
 */
export function fitRidgeRobust(X, Y, lambda = 1e-3, sigma = 2) {
  const model = fitRidge(X, Y, lambda);
  const residuals = X.map((x, i) => {
    const p = predictRidge(model, x);
    return Math.hypot(p[0] - Y[i][0], p[1] - Y[i][1]);
  });
  const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  const sd = Math.sqrt(residuals.reduce((a, r) => a + (r - mean) ** 2, 0) / residuals.length);
  const keep = residuals.map((r) => r <= mean + sigma * sd);
  const kept = keep.filter(Boolean).length;

  if (kept < X.length && kept >= X.length * 0.6) {
    const Xf = X.filter((_, i) => keep[i]);
    const Yf = Y.filter((_, i) => keep[i]);
    return { model: fitRidge(Xf, Yf, lambda), X: Xf, Y: Yf };
  }
  return { model, X, Y };
}

export function rmse(model, X, Y) {
  let sum = 0;
  for (let i = 0; i < X.length; i += 1) {
    const p = predictRidge(model, X[i]);
    sum += (p[0] - Y[i][0]) ** 2 + (p[1] - Y[i][1]) ** 2;
  }
  return Math.sqrt(sum / X.length);
}
