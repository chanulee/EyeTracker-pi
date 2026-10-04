"""Experimental routes. Original Orlosky and upstream RITnet stay unchanged."""
from pathlib import Path
from collections import deque
import hashlib
import cv2
import numpy as np

from .detectors import OpenSourceTracker, work_image


def visible_arc(contour):
    """Remove straight closing edges caused by eyelids; never force a circle."""
    points = contour.reshape(-1, 2).astype(np.float32)
    if len(points) < 24:
        return None
    smooth = sum(np.roll(points, k, axis=0) for k in range(-3, 4)) / 7
    before, after = smooth - np.roll(smooth, 7, axis=0), np.roll(smooth, -7, axis=0) - smooth
    bend = np.abs(before[:, 0] * after[:, 1] - before[:, 1] * after[:, 0])
    bend /= np.maximum(np.linalg.norm(before, axis=1) * np.linalg.norm(after, axis=1), 1)
    arc = smooth[bend > .10].reshape(-1, 1, 2)
    if len(arc) < 20 or len(arc) / len(points) < .35:
        return None
    ellipse = cv2.fitEllipseAMS(arc)
    center, axes, angle = ellipse
    if not np.isfinite([*center, *axes, angle]).all() or min(axes) <= 0:
        return None
    rotation = np.deg2rad(angle)
    local = (arc[:, 0] - center) @ np.array([[np.cos(rotation), -np.sin(rotation)],
                                           [np.sin(rotation), np.cos(rotation)]])
    radial = np.sqrt(np.sum((local / (np.array(axes) / 2)) ** 2, axis=1))
    bins = np.floor((np.arctan2(local[:, 1] / axes[1], local[:, 0] / axes[0]) + np.pi) * 12 / (2 * np.pi)).astype(int) % 12
    support = float(np.mean(np.abs(radial - 1) < .12))
    coverage = len(np.unique(bins[np.abs(radial - 1) < .12])) / 12
    if support < .7 or coverage < .5:
        return None
    return ellipse, arc, support, coverage


class StableOrlosky:
    crop_to_aspect_ratio = staticmethod(work_image)

    def __init__(self, engine='orlosky-stable', focal_length=560.):
        self.engine = engine
        self.eye_sphere_adjustment_enabled = True
        self.settings = dict(pupil_min=10., pupil_max=160., intensity_range=23, auto_intensity=True, roi=[.1, .25, .9, .75])
        self.metadata = dict(engine=engine, work_size=[640, 480], input_kind='pupil_center_2d',
                             confidence_kind='experimental_shape_contrast', intrinsics_measured=False,
                             direction_frame='image_feature', origin_unit=None)
        self.model = OpenSourceTracker('pupil-3d', focal_length) if engine == 'orlosky-stable-3d' else None
        if self.model:
            self.metadata.update(self.model.metadata, engine=engine, detector_source='orlosky-stable',
                                 confidence_kind='experimental_shape_contrast')
        self.baseline = None
        if engine.startswith('orlosky-'):
            from .server import load_tracker
            self.baseline = load_tracker('orlosky')
            self.baseline.apply_binary_threshold = self.threshold
            self.baseline.get_darkest_area = self.darkest
            self.baseline.filter_contours_by_area_and_return_largest = self.choose_contour
            self.baseline.optimize_contours_by_angle = self.arc_points
        self.reset_tracking_state()

    def configure(self, settings):
        self.settings = dict(settings)
        self.reset_tracking_state()

    def reset_tracking_state(self):
        self.previous = self.pending = self.last = None
        self.misses = self.pending_count = 0
        self.segmentation = None
        self.diameters = deque(maxlen=120)
        self.effective_range = float(self.settings['intensity_range'])
        if self.baseline:
            self.baseline.reset_tracking_state()
        if self.model:
            self.model.configure(self.settings)

    def darkest(self, frame):
        self.gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        self.arc_cache = {}
        l, t, r, b = np.array(self.settings['roi']) * [640, 480, 640, 480]
        if self.previous is not None and self.misses < 3:
            cx, cy = self.previous[0]
            radius = max(60, max(self.previous[1]))
            l, t, r, b = max(l, cx-radius), max(t, cy-radius), min(r, cx+radius), min(b, cy+radius)
        average = cv2.boxFilter(self.gray, cv2.CV_32F, (20, 20))
        allowed = np.full(average.shape, np.inf, np.float32)
        l, t, r, b = map(int, (l, t, r, b))
        region = self.gray[t:b, l:r]
        seeds = np.zeros(region.shape, bool)
        # A global darkest pixel can be hair or a glasses arm spanning the ROI.
        # ponytail: compact dark regions are a heuristic; use eye segmentation if compact frames still win.
        for offset in (8, self.effective_range, 2*self.effective_range):
            mask = np.uint8(region <= float(region.min()) + offset)
            count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
            for label in range(1, count):
                _, _, width, height, area = stats[label]
                if area >= 25 and max(width, height) <= self.settings['pupil_max']:
                    seeds |= labels == label
        allowed[t:b, l:r] = np.where(seeds, average[t:b, l:r], np.inf)
        if not seeds.any():
            return (int((l+r)/2), int((t+b)/2))
        y, x = np.unravel_index(np.argmin(allowed), allowed.shape)
        if self.settings.get('auto_intensity') and not getattr(self, 'calibration_active', False):
            radius = max(30, round(max(self.previous[1]))) if self.previous is not None else 40
            region = self.gray[max(t, y-radius):min(b, y+radius+1), max(l, x-radius):min(r, x+radius+1)]
            if region.size:
                low, high = np.percentile(region, [15, 60])
                target = float(np.clip(high-low, 8, 45))
                self.effective_range = .9*self.effective_range + .1*target
        elif not self.settings.get('auto_intensity'):
            self.effective_range = float(self.settings['intensity_range'])
        return int(x), int(y)

    def threshold(self, image, darkest, added):
        cutoff = float(darkest) + added * self.effective_range / 40
        return cv2.threshold(image, cutoff, 255, cv2.THRESH_BINARY_INV)[1]

    def score(self, ellipse):
        (cx, cy), axes, angle = ellipse
        l, t, r, b = np.array(self.settings['roi']) * [640, 480, 640, 480]
        if (not np.isfinite([cx, cy, *axes, angle]).all() or not l < cx < r or not t < cy < b
                or not self.settings['pupil_min'] <= max(axes) <= self.settings['pupil_max']
                or min(axes) / max(axes) < .35):
            return None
        # Preserve pupil identity through missed frames; iris candidates cannot become the new size prior.
        if len(self.diameters) >= 12:
            expected = float(np.median(self.diameters))
            if not .55*expected <= max(axes) <= 1.65*expected:
                return None
        inner = np.zeros(self.gray.shape, np.uint8)
        outer = np.zeros_like(inner)
        cv2.ellipse(inner, ((cx, cy), tuple(np.array(axes) * .7), angle), 255, -1)
        cv2.ellipse(outer, ((cx, cy), tuple(np.array(axes) * 1.25), angle), 255, -1)
        whole = np.zeros_like(inner)
        cv2.ellipse(whole, ellipse, 255, -1)
        inside = self.gray[inner > 0]
        ring = self.gray[(outer > 0) & (whole == 0)]
        if len(inside) < 10 or len(ring) < 10:
            return None
        contrast = float(np.median(ring) - np.median(inside))
        if contrast < 3:
            return None
        distance = np.linalg.norm(np.array([cx, cy]) - (self.previous[0] if self.previous is not None else [320, 240]))
        return contrast / 255 - distance / 640

    def choose_contour(self, contours, pixel_thresh, ratio_thresh):
        best, best_score = None, -np.inf
        for contour in contours:
            # Re-expand CHAIN_APPROX_SIMPLE so lid removal uses actual arc length.
            mask = np.zeros(self.gray.shape, np.uint8)
            cv2.drawContours(mask, [contour], -1, 255, -1)
            dense = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0]
            fitted = visible_arc(max(dense, key=cv2.contourArea)) if dense else None
            if fitted is None:
                continue
            value = self.score(fitted[0])
            if value is not None and value > best_score:
                best, best_score = contour, value
                self.arc_cache[contour.tobytes()] = fitted
        return [best] if best is not None else []

    def arc_points(self, contours, image):
        fitted = self.arc_cache.get(contours[0].tobytes()) if contours else None
        return fitted[1] if fitted else np.empty((0, 1, 2), np.float32)

    def publish(self, ellipse, quality, details):
        self.last = dict(confidence=0., direction=None, ready=False, pupil_ellipse=None,
                         tracker_details=dict(self.metadata, settings=dict(self.settings), **details))
        if ellipse is None or quality < .65:
            self.misses += 1
            if self.misses >= 3:
                self.previous = None
            self.last['tracker_error'] = '가림/대비/눈 영역 때문에 신뢰할 동공 후보 없음'
            return
        if self.previous is not None:
            distance = np.linalg.norm(np.array(ellipse[0]) - self.previous[0])
            if distance > max(45, max(self.previous[1]) * .8):
                if self.pending is not None and np.linalg.norm(np.array(ellipse[0]) - self.pending) < 25:
                    self.pending_count += 1
                else:
                    self.pending_count = 1
                self.pending = np.array(ellipse[0])
                if self.pending_count < 3:
                    self.last['tracker_error'] = '큰 후보 이동 확인 중 · 예측 좌표는 보정에 사용하지 않음'
                    return
        self.previous, self.misses, self.pending_count = ellipse, 0, 0
        if not getattr(self, 'calibration_active', False):
            self.diameters.append(max(ellipse[1]))
        self.pending = None
        center, axes, angle = ellipse
        self.last.update(confidence=quality, ready=len(self.diameters) >= 12,
            pupil_ellipse=dict(center=list(map(float, center)), axes=list(map(float, axes)), angle_degrees=float(angle)),
            raw=[(center[0]/640-.5)*2, (.5-center[1]/480)*2])
        if self.model:
            self.model.eye_sphere_adjustment_enabled = self.eye_sphere_adjustment_enabled
            self.model.frame_timestamp = getattr(self, 'frame_timestamp', None)
            self.model.finish_observation(self.gray, center, axes, angle, quality, self.last['tracker_details'])
            self.last = self.model.get_last_tracking_result()

    def process_frame(self, image):
        self.baseline.eye_sphere_adjustment_enabled = False
        self.baseline.process_frame(image)
        result = self.baseline.get_last_tracking_result()
        pupil = result.get('pupil_ellipse') if result else None
        ellipse = (tuple(pupil['center']), tuple(pupil['axes']), pupil['angle_degrees']) if pupil else None
        fitted = min(self.arc_cache.values(), key=lambda f: np.linalg.norm(np.array(f[0][0]) - ellipse[0])) if ellipse and self.arc_cache else None
        quality = min(float(result['confidence']), fitted[2]) if pupil and fitted else 0.
        self.publish(ellipse, quality, dict(occlusion_policy='visible_curved_arcs', predicted=False,
                     arc_support=fitted[2] if fitted else 0., arc_coverage=fitted[3] if fitted else 0.,
                     effective_intensity_range=self.effective_range, photometry_frozen=bool(getattr(self, 'calibration_active', False)),
                     expected_pupil_diameter=float(np.median(self.diameters)) if self.diameters else None))

    def get_last_tracking_result(self):
        return self.last


def tracked_translation(before, after, mask, minimum=4):
    """Measured LK motion with forward/backward and consensus checks."""
    points = cv2.goodFeaturesToTrack(before, 120, .03, 6, mask=mask)
    if points is None or len(points) < minimum:
        return None
    moved, status, _ = cv2.calcOpticalFlowPyrLK(before, after, points, None, winSize=(25, 25), maxLevel=3)
    if moved is None:
        return None
    back, reverse, _ = cv2.calcOpticalFlowPyrLK(after, before, moved, None, winSize=(25, 25), maxLevel=3)
    if back is None:
        return None
    valid = (status[:, 0] > 0) & (reverse[:, 0] > 0) & (np.linalg.norm(back[:, 0]-points[:, 0], axis=1) < 1.)
    delta = (moved-points)[:, 0][valid]
    if len(delta) < minimum:
        return None
    shift = np.median(delta, axis=0)
    inliers = np.linalg.norm(delta-shift, axis=1) < 1.5
    if sum(inliers) < minimum or np.mean(inliers) < .6 or np.linalg.norm(shift) > 25:
        return None
    return np.median(delta[inliers], axis=0)


class TemporalOrlosky(StableOrlosky):
    """Image tracking proposes location; the detector checks identity at that location."""
    def __init__(self):
        super().__init__('orlosky-flow')
        self.settings.update(pupil_min=25., pupil_max=100., compensate_motion=False)
        self.metadata.update(temporal_method='LK_forward_backward_patch_check', motion_model='skin_translation_experiment')

    def reset_tracking_state(self):
        super().reset_tracking_state()
        self.flow_gray = None
        self.flow_only = 0
        self.motion_shift = np.zeros(2)
        self.motion_lost = False
        self.motion_gray = None
        self.motion_misses = 0
        self.flow_center = None

    def seed_pupil(self, rectangle):
        if self.flow_gray is None:
            raise ValueError('최신 눈 영상이 필요합니다')
        l, t, r, b = np.array(rectangle) * [640, 480, 640, 480]
        ellipse = ((float((l+r)/2), float((t+b)/2)), (float(r-l), float(b-t)), 0.)
        saved = self.flow_center
        self.flow_center = None
        # Validate the manual target without inheriting an earlier wrong size identity.
        diameters = self.diameters
        self.diameters = deque(maxlen=120)
        valid = self.score(ellipse)
        self.diameters, self.flow_center = diameters, saved
        if valid is None:
            raise ValueError('선택 영역의 크기·대비가 부족합니다. 동공 전체만 감싸거나 지름 제한을 조정하세요')
        gray = self.flow_gray
        self.reset_tracking_state()
        self.flow_gray = gray
        self.motion_gray = gray
        self.previous = ellipse
        self.diameters.append(max(ellipse[1]))

    def score(self, ellipse):
        value = super().score(ellipse)
        if value is not None and getattr(self, 'flow_center', None) is not None:
            distance = np.linalg.norm(np.array(ellipse[0])-self.flow_center)
            if distance > max(10, max(self.previous[1])*.3):
                return None
            value -= distance / 30
        return value

    def process_frame(self, image):
        gray = cv2.cvtColor(work_image(image), cv2.COLOR_BGR2GRAY)
        previous_gray, previous = self.flow_gray, self.previous
        self.flow_center = None
        motion, flow, correlation = None, None, None
        if previous_gray is not None:
            mask = np.zeros_like(gray)
            mask[35:90, 64:576] = 255
            mask[355:450, 64:576] = 255
            reference = self.motion_gray if self.motion_gray is not None else previous_gray
            mask[reference > 220] = 0
            motion = tracked_translation(reference, gray, mask, minimum=10)
            if motion is not None:
                self.motion_shift += motion
                self.motion_gray = gray
                self.motion_misses = 0
            elif self.settings.get('compensate_motion'):
                self.motion_misses += 1
                self.motion_lost = self.motion_misses >= 5 or self.motion_lost
            if previous is not None:
                center, axes, angle = previous
                mask[:] = 0
                cv2.ellipse(mask, (center, tuple(np.array(axes)*1.8), angle), 255, -1)
                flow = tracked_translation(previous_gray, gray, mask)
                if flow is not None:
                    expected = np.array(center)+flow
                    size = (max(25, round(max(axes)*1.5)),)*2
                    before = cv2.getRectSubPix(previous_gray, size, tuple(map(float, center)))
                    after = cv2.getRectSubPix(gray, size, tuple(map(float, expected)))
                    correlation = float(cv2.matchTemplate(after, before, cv2.TM_CCOEFF_NORMED)[0, 0])
                    if correlation >= .85:
                        self.flow_center = expected
                        self.previous = (tuple(map(float, expected)), axes, angle)
        super().process_frame(image)
        source = 'detector_with_flow' if self.flow_center is not None else 'detector'
        if self.last.get('pupil_ellipse'):
            self.flow_only = 0
        elif self.flow_center is not None and self.flow_only < 3:
            ellipse = self.previous
            # ponytail: translation misses pupil deformation; re-detection remains mandatory.
            if ellipse is not None and self.score(ellipse) is not None:
                self.publish(ellipse, .70, dict(predicted=True))
                if self.last.get('pupil_ellipse'):
                    self.flow_only += 1
                    source = 'verified_optical_flow'
        self.flow_gray = gray
        if self.motion_gray is None:
            self.motion_gray = gray
        self.last['tracker_details'].update(temporal_source=source, fresh_detector=source != 'verified_optical_flow', flow_only_frames=self.flow_only,
            flow_patch_correlation=correlation, eye_flow_px=flow.tolist() if flow is not None else None,
            skin_motion_px=motion.tolist() if motion is not None else None,
            accumulated_skin_motion_px=self.motion_shift.tolist(), motion_reference_lost=self.motion_lost,
            motion_compensation_enabled=bool(self.settings.get('compensate_motion')))
        if self.settings.get('compensate_motion'):
            if self.motion_lost or self.motion_misses:
                self.last.update(raw=None, confidence=0., ready=False,
                    tracker_error='피부 움직임 기준 소실 · 보정 취소 후 동공을 다시 지정하세요' if self.motion_lost else '피부 움직임 추적 재확인 중')
            elif self.last.get('pupil_ellipse'):
                center = np.array(self.last['pupil_ellipse']['center'])-self.motion_shift
                self.last['raw'] = [(center[0]/640-.5)*2, (.5-center[1]/480)*2]


class RITnetTracker(StableOrlosky):
    def __init__(self):
        import torch
        from .vendor.ritnet.densenet import DenseNet2D
        super().__init__('ritnet')
        self.settings['auto_intensity'] = False
        self.torch = torch
        torch.set_num_threads(2)
        self.net = DenseNet2D(dropout=True, prob=.2)
        path = Path(__file__).parent / 'vendor/ritnet/best_model.pkl'
        self.net.load_state_dict(torch.load(path, map_location='cpu', weights_only=True))
        self.net.eval()
        self.metadata.update(model_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                             confidence_kind='experimental_segmentation_arc', inference_size=[320, 240], device='cpu')
        self.clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8))
        self.gamma = np.uint8(255 * (np.arange(256) / 255) ** .8)

    def process_frame(self, image):
        self.gray = cv2.cvtColor(work_image(image), cv2.COLOR_BGR2GRAY)
        gray = cv2.resize(self.gray, (320, 240))
        gray = self.clahe.apply(cv2.LUT(gray, self.gamma))
        data = self.torch.from_numpy(gray.astype(np.float32) / 127.5 - 1)[None, None]
        with self.torch.inference_mode():
            probabilities = self.net(data).softmax(1)[0].numpy()
        labels = probabilities.argmax(0).astype(np.uint8)
        self.segmentation = cv2.resize(labels, (640, 480), interpolation=cv2.INTER_NEAREST)
        self.arc_cache = {}
        mask = np.uint8(self.segmentation == 3) * 255
        contours = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0]
        candidates = []
        for contour in contours:
            fitted = visible_arc(contour)
            if fitted is None:
                continue
            value = self.score(fitted[0])
            if value is not None:
                candidates.append((value, fitted))
        fitted = max(candidates, key=lambda row: row[0])[1] if candidates else None
        probability = float(probabilities[3][labels == 3].mean()) if np.any(labels == 3) else 0.
        quality = min(probability, fitted[2]) if fitted else 0.
        self.publish(fitted[0] if fitted else None, quality,
                     dict(occlusion_policy='visible_curved_arcs', predicted=False, pupil_probability=probability,
                          visible_pupil_pixels=int(np.sum(labels == 3)), visible_iris_pixels=int(np.sum(labels == 2))))
