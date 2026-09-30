"""Pupil Labs 3D model fed by the exhibition's existing 2D ellipse detector.

Directions are pupil optical-axis estimates in eye-camera coordinates, not
screen gaze or calibrated visual axes. Focal length is in the 640px work image.
"""
from collections import deque
import time

import cv2
import numpy as np


class PupilTracker:
    def __init__(self, ellipse_tracker, focal_length=560., intrinsics_measured=False):
        from pye3d.camera import CameraModel
        from pye3d.detector_3d import Detector3D

        self.ellipse_tracker = ellipse_tracker
        self.focal_length = float(focal_length)
        self.intrinsics_measured = intrinsics_measured
        self.metadata = dict(engine='pupil', focal_length_px=self.focal_length,
                             intrinsics_measured=intrinsics_measured,
                             direction_frame='eye_camera', origin_unit='mm')
        # Our 2D confidence is Dice shape overlap, not Pupil's confidence metric.
        # Use explicit thresholds; never substitute this for 3D model checks.
        self.detector = Detector3D(CameraModel(self.focal_length, (640, 480)),
                                   threshold_swirski=.65, threshold_short_term=.8,
                                   threshold_long_term=.85)
        self.eye_sphere_adjustment_enabled = True
        self.reset_tracking_state()

    def reset_tracking_state(self):
        self.ellipse_tracker.reset_tracking_state()
        self.detector.reset()
        self.centers = deque(maxlen=300)
        self.started = None
        self.last = None

    def process_frame(self, image, timestamp=None):
        self.last = None
        # Reuse just the ellipse from the existing detector; ignore its 3D vector.
        self.ellipse_tracker.eye_sphere_adjustment_enabled = False
        self.ellipse_tracker.process_frame(image)
        result2d = self.ellipse_tracker.get_last_tracking_result()
        if not result2d or not result2d.get('pupil_ellipse'):
            return
        pupil = result2d['pupil_ellipse']
        quality = float(result2d['confidence'])
        self.last = dict(pupil_ellipse=pupil, confidence=quality, direction=None, ready=False,
                         tracker_details=dict(engine='pupil', model_quality=0.,
                                              focal_length_px=self.focal_length,
                                              intrinsics_measured=self.intrinsics_measured,
                                              direction_frame='eye_camera', origin_unit='mm'))
        if quality < .65:
            return
        timestamp = time.monotonic() if timestamp is None else timestamp
        if self.started is None:
            self.started = timestamp
        axes = pupil['axes']
        angle = pupil['angle_degrees']
        if axes[0] > axes[1]:
            axes = [axes[1], axes[0]]
            angle = (angle + 90) % 180
        self.detector.is_long_term_model_frozen = not self.eye_sphere_adjustment_enabled
        gray = cv2.cvtColor(cv2.resize(image, (640, 480)), cv2.COLOR_BGR2GRAY)
        observation = dict(ellipse=dict(center=pupil['center'], axes=axes, angle=angle),
                           confidence=quality, timestamp=timestamp)
        result = self.detector.update_and_detect(observation, gray)
        model_quality = float(result.get('model_confidence', 0.))
        normal = np.asarray(result.get('circle_3d', {}).get('normal'), dtype=float)
        origin = np.asarray(result.get('sphere', {}).get('center'), dtype=float)
        self.centers.append(pupil['center'])
        coverage = np.ptp(np.asarray(self.centers), axis=0)
        elapsed = timestamp - self.started
        self.last['tracker_details'].update(model_quality=model_quality, fit_samples=len(self.centers),
                                            fit_elapsed_s=round(elapsed, 1),
                                            pupil_axis_ratio=float(axes[0] / axes[1]))
        if origin.shape == (3,) and np.isfinite(origin).all():
            self.last['tracker_details']['eye_origin_mm'] = origin.tolist()
        if (normal.shape != (3,) or origin.shape != (3,) or not np.isfinite(normal).all()
                or not np.isfinite(origin).all() or np.linalg.norm(normal) < 1e-6
                or model_quality < .5):
            self.last['tracker_error'] = '3D 눈 모델 준비 중 · 눈을 좌우·상하로 천천히 움직이세요'
            return
        self.last.update(direction=(normal / np.linalg.norm(normal)).tolist(), origin=origin.tolist(),
                         ready=bool(elapsed >= 5 and len(self.centers) >= 30 and np.all(coverage >= 8)))

    def get_last_tracking_result(self):
        return self.last


def relative_angles(direction, reference):
    """Zero the camera's tilt with a forward reference; roll remains unspecified."""
    normal = np.asarray(direction, dtype=float)
    forward = np.asarray(reference, dtype=float)
    if (normal.shape != (3,) or forward.shape != (3,) or not np.isfinite(normal).all()
            or not np.isfinite(forward).all() or np.linalg.norm(forward) < 1e-6):
        raise ValueError('유효한 3D 방향이 필요합니다')
    forward /= np.linalg.norm(forward)
    # Project image-right onto the reference tangent plane. Positive pitch uses
    # camera image-up; these are relative camera axes, not physical head axes.
    right = np.array([1., 0., 0.]) - forward[0] * forward
    if np.linalg.norm(right) < 1e-6:
        raise ValueError('정면 기준이 카메라 옆을 향합니다. 위치를 확인하세요')
    right /= np.linalg.norm(right)
    up = np.cross(forward, right)
    x, y, z = normal @ right, normal @ up, normal @ forward
    return dict(yaw=float(np.degrees(np.arctan2(x, z))),
                pitch=float(np.degrees(np.arctan2(y, np.hypot(x, z)))))
