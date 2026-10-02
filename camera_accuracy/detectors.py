"""Thin adapters around published detectors; no replacement pupil algorithm."""
from collections import deque
from importlib.metadata import version
import time

import cv2
import numpy as np


def work_image(image):
    height, width = image.shape[:2]
    if width / height > 4 / 3:
        size = int(height * 4 / 3)
        image = image[:, (width - size) // 2:(width - size) // 2 + size]
    else:
        size = int(width * 3 / 4)
        image = image[(height - size) // 2:(height - size) // 2 + size, :]
    return cv2.resize(image, (640, 480))


class OpenSourceTracker:
    crop_to_aspect_ratio = staticmethod(work_image)

    def __init__(self, engine='pupil-2d', focal_length=560.):
        self.engine = engine
        self.focal_length = focal_length
        self.eye_sphere_adjustment_enabled = True
        if engine.startswith('pupil-'):
            from pupil_detectors import Detector2D
            self.detector_type = Detector2D
            packages = {'pupil-detectors': version('pupil-detectors')}
        else:
            import pypupilext
            self.detector_type = pypupilext.PuRe if engine in ('pure', 'pure-3d') else pypupilext.ElSe
            packages = {'PyPupilEXT': version('PyPupilEXT')}
        self.detector3d = None
        if engine in ('pupil-3d', 'pure-3d'):
            from pye3d.camera import CameraModel
            from pye3d.detector_3d import Detector3D
            self.detector3d = Detector3D(CameraModel(focal_length, (640, 480)))
            packages['pye3d'] = version('pye3d')
        self.settings = dict(pupil_min=10., pupil_max=160., intensity_range=23, roi=[0., 0., 1., 1.])
        self.metadata = dict(engine=engine, packages=packages, work_size=[640, 480],
            input_kind='optical_axis' if self.detector3d else 'pupil_center_2d',
            direction_frame='eye_camera' if self.detector3d else 'image_feature',
            origin_unit='mm' if self.detector3d else None,
            focal_length_px=focal_length if self.detector3d else None, intrinsics_measured=False)
        self.reset_tracking_state()

    def reset_tracking_state(self):
        self.detector = self.detector_type()
        if self.engine.startswith('pupil-'):
            self.detector.update_properties({'pupil_size_min': int(self.settings['pupil_min']),
                'pupil_size_max': int(self.settings['pupil_max']), 'intensity_range': self.settings['intensity_range']})
        if self.detector3d:
            self.detector3d.reset()
        self.centers = deque(maxlen=300)
        self.started = None
        self.last = None

    def configure(self, settings):
        self.settings = dict(settings)
        self.reset_tracking_state()

    def process_frame(self, image):
        gray = cv2.cvtColor(work_image(image), cv2.COLOR_BGR2GRAY)
        left, top, right, bottom = self.settings['roi']
        x, y, x2, y2 = round(left * 640), round(top * 480), round(right * 640), round(bottom * 480)
        minimum, maximum = self.settings['pupil_min'], self.settings['pupil_max']
        if self.engine.startswith('pupil-'):
            from pupil_detectors import Roi
            observation = self.detector.detect(gray, roi=Roi.from_rect(x, y, x2 - x, y2 - y))
            ellipse = observation['ellipse']
            center, axes, angle = ellipse['center'], ellipse['axes'], ellipse['angle']
            quality = float(observation['confidence'])
            details = dict(self.metadata, settings=dict(self.settings), confidence_kind='pupil_labs_2d')
        else:
            import pypupilext
            pupil = pypupilext.Pupil()
            self.detector.runWithConfidence(gray, (x, y, x2 - x, y2 - y), pupil, minimum, maximum)
            center, axes, angle = pupil.center, pupil.size, pupil.angle
            # PuRe has its own detection confidence. Outline fit alone is not pupil identity.
            quality = float(pupil.confidence if self.engine in ('pure', 'pure-3d') else pupil.outline_confidence)
            details = dict(self.metadata, settings=dict(self.settings), confidence_kind=self.engine,
                           outline_confidence=float(pupil.outline_confidence) if np.isfinite(pupil.outline_confidence) else None)
            observation = dict(ellipse=dict(center=center, axes=axes, angle=angle), confidence=quality)
        values = np.asarray([*center, *axes, angle, quality], dtype=float)
        self.last = dict(confidence=0., direction=None, ready=False, pupil_ellipse=None, tracker_details=details)
        if (not np.isfinite(values).all() or min(axes) <= 0 or not minimum <= max(axes) <= maximum
                or not x <= center[0] < x2 or not y <= center[1] < y2):
            self.last['tracker_error'] = '설정한 눈 영역/동공 크기에 맞는 후보 없음'
            return
        pupil_ellipse = dict(center=[float(v) for v in center], axes=[float(v) for v in axes], angle_degrees=float(angle))
        self.last.update(confidence=max(0., min(1., quality)), pupil_ellipse=pupil_ellipse)
        if self.detector3d is None:
            # Runtime maps these explicit 2D image features, not physical gaze directions.
            self.last.update(raw=[(center[0] / 640 - .5) * 2, (.5 - center[1] / 480) * 2], ready=quality >= .65)
            return
        if quality < .65:
            self.last['tracker_error'] = '동공 검출 품질 부족'
            return
        now = time.monotonic()
        if self.started is None:
            self.started = now
        observation['timestamp'] = now
        if observation['ellipse']['axes'][0] > observation['ellipse']['axes'][1]:
            observation['ellipse'] = dict(center=center, axes=list(reversed(axes)), angle=(angle + 90) % 180)
        self.detector3d.is_long_term_model_frozen = not self.eye_sphere_adjustment_enabled
        result = self.detector3d.update_and_detect(observation, gray)
        model_quality = float(result.get('model_confidence', 0.))
        native_quality = float(result.get('confidence', 0.))
        normal = np.asarray(result.get('circle_3d', {}).get('normal'), dtype=float)
        origin = np.asarray(result.get('sphere', {}).get('center'), dtype=float)
        self.centers.append(list(center))
        coverage = np.ptp(np.asarray(self.centers), axis=0)
        elapsed = now - self.started
        # Upstream model_confidence checks physiological bounds, not measured fit accuracy.
        details.update(model_confidence=model_quality if np.isfinite(model_quality) else None,
                       confidence_3d=native_quality if np.isfinite(native_quality) else None, fit_samples=len(self.centers),
                       fit_elapsed_s=elapsed, coverage_px=coverage.tolist(), adaptation_enabled=self.eye_sphere_adjustment_enabled)
        if (not np.isfinite([model_quality, native_quality]).all() or normal.shape != (3,) or origin.shape != (3,)
                or not np.isfinite(normal).all() or not np.isfinite(origin).all() or np.linalg.norm(normal) < 1e-6
                or model_quality < .5):
            self.last['tracker_error'] = '3D 눈 모델 준비 중 · 눈을 좌우·상하로 천천히 움직이세요'
            return
        self.last.update(direction=(normal / np.linalg.norm(normal)).tolist(), origin=origin.tolist(),
            confidence=min(quality, native_quality), eye_center=origin.tolist(), sphere_radius=result['sphere']['radius'],
            # ponytail: minimum warmup/coverage heuristic; use measured reprojection error for a fit-quality gate.
            ready=bool(elapsed >= 5 and len(self.centers) >= 30 and np.all(coverage >= 8)))

    def get_last_tracking_result(self):
        return self.last
