/**
 * 카메라(=사람)별로 순서대로 진행하는 캘리브레이션/검증 진행 상태 머신.
 * DOM 이나 React 에 의존하지 않아 단독으로 검증할 수 있다.
 *
 * 단계 흐름: intro(대기) → 각 점마다 move(이동 대기) → collect(수집) → 다음 점
 *            마지막 점이 끝나면 stage-done, 다음 카메라가 있으면 다시 intro.
 */

export function createSession({
  mode,
  stages,
  points,
  moveMs = 800,
  collectMs = 1000,
  settleMs = 0,
  minSamples = 8,
}) {
  return {
    mode,
    stages,
    points,
    moveMs,
    collectMs,
    // 이동 대기(move)가 끝나고 수집(collect)을 시작해도, 바로 그 순간엔 눈이 아직
    // 미세하게 안착하는 중이라 초반 프레임은 노이즈가 된다. collect 앞 settleMs 동안은
    // 샘플을 버리고, 눈이 멈춘 뒤의 안정적인 샘플만 학습에 쓴다.
    settleMs,
    minSamples,
    stageIdx: 0,
    idx: 0,
    phase: 'intro',
    phaseStart: 0,
    pointSamples: 0,
  };
}

export const currentCam = (s) => s.stages[s.stageIdx];
export const currentPoint = (s) => s.points[s.idx];
export const isIntro = (s) => s.phase === 'intro';

/** 대기 화면에서 해당 단계를 시작한다. */
export function beginStage(s, now) {
  s.phase = 'move';
  s.phaseStart = now;
  s.idx = 0;
  s.pointSamples = 0;
}

/**
 * 매 프레임 호출한다.
 * @param {boolean} hasSample 이번 프레임에 쓸 수 있는 새 특징이 있는지
 * @returns {{event:'idle'|'move-end'|'next-point'|'stage-done', sampleIndex:number}}
 *          sampleIndex 가 0 이상이면 해당 점의 샘플로 저장하면 된다.
 */
export function step(s, now, hasSample) {
  if (s.phase === 'intro') return { event: 'idle', sampleIndex: -1 };

  const elapsed = now - s.phaseStart;

  if (s.phase === 'move') {
    if (elapsed < s.moveMs) return { event: 'idle', sampleIndex: -1 };
    s.phase = 'collect';
    s.phaseStart = now;
    s.pointSamples = 0;
    return { event: 'move-end', sampleIndex: -1 };
  }

  let sampleIndex = -1;
  // collect 앞 settleMs 동안은 눈이 안착 중이라 샘플을 버린다(학습 제외).
  if (hasSample && elapsed >= s.settleMs) {
    s.pointSamples += 1;
    sampleIndex = s.idx;
  }

  if (elapsed < s.collectMs) return { event: 'idle', sampleIndex };
  // 얼굴을 놓쳤으면 최소 샘플을 채울 때까지 최대 2.5배까지 기다린다.
  if (s.pointSamples < s.minSamples && elapsed < s.collectMs * 2.5) {
    return { event: 'idle', sampleIndex };
  }

  s.idx += 1;
  s.pointSamples = 0;
  if (s.idx >= s.points.length) {
    s.phase = 'intro';
    return { event: 'stage-done', sampleIndex };
  }
  s.phase = 'move';
  s.phaseStart = now;
  return { event: 'next-point', sampleIndex };
}

/** 단계 학습이 끝난 뒤 호출. 다음 단계가 남아 있으면 true (다시 대기 화면). */
export function advanceStage(s) {
  s.stageIdx += 1;
  s.idx = 0;
  s.pointSamples = 0;
  s.phase = 'intro';
  return s.stageIdx < s.stages.length;
}
