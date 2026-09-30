// 1€ Filter: 저속 구간에서는 강하게, 빠른 이동에서는 약하게 스무딩해서
// 지터와 지연을 동시에 잡는다.
class LowPass {
  constructor() {
    this.y = null;
    this.s = null;
  }

  filter(value, alpha) {
    this.s = this.y === null ? value : alpha * value + (1 - alpha) * this.s;
    this.y = value;
    return this.s;
  }

  reset() {
    this.y = null;
    this.s = null;
  }
}

function alphaFor(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export class OneEuroFilter {
  constructor({ minCutoff = 1.0, beta = 0.007, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xFilter = new LowPass();
    this.dxFilter = new LowPass();
    this.lastTime = null;
    this.lastValue = null;
  }

  setParams({ minCutoff, beta }) {
    if (typeof minCutoff === 'number') this.minCutoff = minCutoff;
    if (typeof beta === 'number') this.beta = beta;
  }

  reset() {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
    this.lastValue = null;
  }

  filter(value, timestampMs) {
    if (this.lastTime === null) {
      this.lastTime = timestampMs;
      this.lastValue = value;
      return this.xFilter.filter(value, 1);
    }
    const dt = Math.max((timestampMs - this.lastTime) / 1000, 1 / 240);
    this.lastTime = timestampMs;

    const dx = (value - this.lastValue) / dt;
    this.lastValue = value;
    const edx = this.dxFilter.filter(dx, alphaFor(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilter.filter(value, alphaFor(cutoff, dt));
  }
}

export class OneEuroPoint {
  constructor(opts) {
    this.fx = new OneEuroFilter(opts);
    this.fy = new OneEuroFilter(opts);
  }

  setParams(opts) {
    this.fx.setParams(opts);
    this.fy.setParams(opts);
  }

  reset() {
    this.fx.reset();
    this.fy.reset();
  }

  filter(x, y, t) {
    return { x: this.fx.filter(x, t), y: this.fy.filter(y, t) };
  }
}
