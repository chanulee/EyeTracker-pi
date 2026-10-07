"""Screen calibration and time-based filtering; no camera or network dependencies."""
from collections import deque
import math
import numpy as np

POINTS = [(x, y) for y in (.1, .5, .9) for x in (.1, .5, .9)]
QUICK_POINTS = [(x, y) for y in (.2, .8) for x in (.15, .5, .85)]
VALIDATION_POINTS = [(.3, .3), (.7, .3), (.3, .7), (.7, .7)]


def features(points, affine=False):
    x, y = np.asarray(points).T
    if affine:
        return np.column_stack((np.ones_like(x), x, y))
    return np.column_stack((np.ones_like(x), x, y, x * y, x * x, y * y))


def fit_calibration(inputs, targets, quick=False):
    inputs, targets = np.asarray(inputs, dtype=float), np.asarray(targets, dtype=float)
    count = 6 if quick else 9
    if inputs.shape != (count, 2) or targets.shape != (count, 2) or not np.isfinite(inputs).all() or not np.isfinite(targets).all():
        raise ValueError(f'{count}개 지점을 모두 수집하세요')
    mu, sd = inputs.mean(axis=0), inputs.std(axis=0)
    warnings = []
    if quick and np.any(sd < .015):
        warnings.append('눈의 이동 범위가 작아 일부 방향을 구분하기 어렵습니다')
        sd = np.maximum(sd, .015)
    if not quick and np.any(sd < .015):
        raise ValueError('눈의 이동 범위가 너무 작습니다. 카메라 위치를 확인하세요')
    design = features((inputs - mu) / sd, affine=quick)
    if quick and (np.linalg.matrix_rank(design) < 3 or np.linalg.cond(design) > 100):
        warnings.append('보정점이 겹쳐 커서가 한쪽 방향으로만 움직일 수 있습니다')
    if not quick and (np.linalg.matrix_rank(design) < 6 or np.linalg.cond(design) > 100):
        raise ValueError('지점 데이터가 겹칩니다. 다시 보정하세요')
    weights = np.linalg.lstsq(design, targets, rcond=None)[0]
    errors = np.linalg.norm(design @ weights - targets, axis=1)
    error = float(np.max(errors))
    if quick and error > .25:
        warnings.append('보정 오차가 큽니다. 커서 테스트로 이동해 실제 어긋남을 확인할 수 있습니다')
    if not quick and error > .12:
        raise ValueError(f'전체 9점 보정 오차 {error:.3f} / 기준 0.120 · 가장 큰 오차는 {int(np.argmax(errors)) + 1}번 목표입니다. '
                         '마지막 점만의 문제가 아닐 수 있습니다. 실패가 반복되면 취소하고 9점부터 다시 보정하세요')
    # Leave-one-point-out checks expose a flexible polynomial fitting inconsistent observations.
    leave_one_out = []
    for index in range(count):
        keep = np.arange(count) != index
        omitted = design[index] @ np.linalg.lstsq(design[keep], targets[keep], rcond=None)[0]
        leave_one_out.append(float(np.linalg.norm(omitted-targets[index])))
    return {'mu': mu.tolist(), 'sd': sd.tolist(), 'weights': weights.tolist(), 'fit_error': error, 'affine': quick,
            'warnings': warnings, 'fit_points': [dict(target=target.tolist(), raw=raw.tolist(), predicted=estimate.tolist(), error_norm=float(err))
                for target, raw, estimate, err in zip(targets, inputs, design @ weights, errors)],
            'loo_errors': leave_one_out, 'loo_max_error': max(leave_one_out)}


def predict(model, raw):
    return (features([(np.asarray(raw) - model['mu']) / model['sd']], affine=model.get('affine', False)) @ model['weights'])[0]


class Stabilizer:
    def __init__(self):
        self.history = deque(maxlen=3)
        self.position = None
        self.last_time = None

    def reset(self):
        self.history.clear()
        self.position = self.last_time = None

    def update(self, point, now, tau=.08, max_speed=4.):
        point = np.asarray(point, dtype=float)
        if point.shape != (2,) or not np.isfinite(point).all():
            self.reset()
            return None
        if self.last_time is None or now - self.last_time > .35:
            self.reset()
        self.history.append(point)
        target = np.median(self.history, axis=0)
        if self.position is None:
            self.position = target
        else:
            dt = max(0., now - self.last_time)
            delta = target - self.position
            distance = np.linalg.norm(delta)
            # ponytail: speed cap trades saccade latency for spike rejection; tune in UI.
            delta *= min(1., max_speed * dt / max(distance, 1e-9))
            self.position += delta * (1 - math.exp(-dt / tau))
        self.last_time = now
        return np.clip(self.position, 0, 1).tolist()
