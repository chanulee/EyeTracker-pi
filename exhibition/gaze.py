"""Screen calibration and time-based filtering; no camera or network dependencies."""
from collections import deque
import math
import numpy as np

POINTS = [(x, y) for y in (.1, .5, .9) for x in (.1, .5, .9)]
VALIDATION_POINTS = [(.3, .35), (.7, .65), (.5, .5)]


def features(points):
    x, y = np.asarray(points).T
    return np.column_stack((np.ones_like(x), x, y, x * y, x * x, y * y))


def fit_calibration(inputs, targets):
    inputs, targets = np.asarray(inputs, dtype=float), np.asarray(targets, dtype=float)
    if inputs.shape != (9, 2) or targets.shape != (9, 2) or not np.isfinite(inputs).all():
        raise ValueError('9개 지점을 모두 수집하세요')
    mu, sd = inputs.mean(axis=0), inputs.std(axis=0)
    if np.any(sd < .015):
        raise ValueError('눈의 이동 범위가 너무 작습니다. 카메라 위치를 확인하세요')
    design = features((inputs - mu) / sd)
    if np.linalg.matrix_rank(design) < 6 or np.linalg.cond(design) > 100:
        raise ValueError('지점 데이터가 겹칩니다. 다시 보정하세요')
    weights = np.linalg.lstsq(design, targets, rcond=None)[0]
    error = float(np.max(np.linalg.norm(design @ weights - targets, axis=1)))
    if error > .12:
        raise ValueError('보정 오차가 큽니다. 자세와 조명을 확인하세요')
    return {'mu': mu.tolist(), 'sd': sd.tolist(), 'weights': weights.tolist(), 'fit_error': error}


def predict(model, raw):
    return (features([(np.asarray(raw) - model['mu']) / model['sd']]) @ model['weights'])[0]


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
