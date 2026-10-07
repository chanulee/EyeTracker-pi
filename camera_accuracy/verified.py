"""DeepVOG-verified pupil tracking with a delayed robust filter.

Idea (trade latency for stability):
  1. A fast classical detector (Orlosky) proposes a pupil ellipse every frame.
  2. DeepVOG (pupil segmentation) runs every ``verify_every`` frames and decides
     *identity*: is the proposal the pupil, or an iris/eyelash/shadow blob?
     Between DeepVOG runs, proposals are gated by the last verified pupil size.
  3. A delayed Hampel filter looks ``delay`` frames into the future and drops
     centre/diameter spikes before anything reaches calibration.

Only accepted frames carry ``raw``; rejected frames publish no coordinates, so
calibration windows never average in an iris frame. This module does not claim
screen accuracy; see VERIFIED_DEEPVOG.md for the replay numbers.
"""
from collections import deque
import os

import cv2
import numpy as np

from .detectors import work_image


def pupil_from_probability(probability, threshold=.5, min_pixels=30):
    """Largest DeepVOG pupil blob -> ellipse in 640x480 work coordinates."""
    mask = np.uint8(probability > threshold)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    if count < 2:
        return None
    label = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    if stats[label, cv2.CC_STAT_AREA] < min_pixels:
        return None
    blob = np.uint8(labels == label) * 255
    # Fill glint holes: the outer contour is the pupil boundary.
    contours = cv2.findContours(blob, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0]
    contour = max(contours, key=cv2.contourArea)
    if len(contour) < 5:
        return None
    (cx, cy), axes, angle = cv2.fitEllipse(contour)
    if not np.isfinite([cx, cy, *axes, angle]).all() or min(axes) <= 0:
        return None
    area = cv2.contourArea(contour)
    hull = cv2.contourArea(cv2.convexHull(contour))
    solidity = area / hull if hull > 0 else 0.
    fill = area / (np.pi * axes[0] * axes[1] / 4)
    # Pupil blobs are solid and ellipse-shaped; lid-cut or iris-merged blobs are not.
    shape = min(1., solidity / .9) * float(np.clip(1 - abs(fill - 1) / .5, 0, 1))
    confidence = float(probability[labels == label].mean()) * shape
    return dict(center=[cx * 2, cy * 2], axes=[axes[0] * 2, axes[1] * 2], angle_degrees=float(angle),
                confidence=float(np.clip(confidence, 0, 1)))


def ellipse_support(probability, pupil):
    """Mean DeepVOG pupil probability inside a 640x480 ellipse (evaluated at 320x240)."""
    mask = np.zeros(probability.shape, np.uint8)
    (cx, cy), (a, b) = pupil['center'], pupil['axes']
    cv2.ellipse(mask, ((cx / 2, cy / 2), (max(a / 2, 1), max(b / 2, 1)), pupil['angle_degrees']), 1, -1)
    inside = probability[mask > 0]
    return float(inside.mean()) if inside.size else 0.


def dark_core(gray, pupil, min_gap=10., shrink=.75):
    """If a candidate is a dark iris containing a darker pupil, return the inner pupil.

    Near its rim a real pupil is still black; an iris-sized candidate has an iris-grey
    rim around a darker compact core (the pupil), which is re-fitted and returned.
    Returns (pupil, replaced: bool) or (None, True) if it is iris-like but no core fits.
    """
    if pupil is None:
        return None, False
    (cx, cy), (a, b) = pupil['center'], pupil['axes']
    angle = pupil['angle_degrees']
    mask, inner = np.zeros(gray.shape, np.uint8), np.zeros(gray.shape, np.uint8)
    cv2.ellipse(mask, ((cx, cy), (a * .95, b * .95), angle), 255, -1)
    cv2.ellipse(inner, ((cx, cy), (a * .7, b * .7), angle), 255, -1)
    band = gray[(mask > 0) & (inner == 0)]
    values = gray[mask > 0]
    if values.size < 50 or band.size < 20:
        return pupil, False
    # Near its edge a pupil is still black (reflections sit inside and are ignored by
    # the 30th percentile); an iris candidate's rim is iris grey, darker core inside.
    p5, rim = np.percentile(values, 5), np.percentile(band, 30)
    if rim - p5 < min_gap:
        return pupil, False
    core = np.uint8((gray <= p5 + .5 * (rim - p5)) & (mask > 0)) * 255
    # Close over pupil reflections first so a glint cannot split the pupil.
    core = cv2.morphologyEx(core, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    core = cv2.morphologyEx(core, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(core)
    if count < 2:
        return None, True
    label = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    contours = cv2.findContours(np.uint8(labels == label) * 255, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0]
    contour = max(contours, key=cv2.contourArea)
    if len(contour) < 5:
        return None, True
    (ex, ey), axes, angle = cv2.fitEllipse(contour)
    if max(axes) >= shrink * max(pupil['axes']):
        return pupil, False          # the dark part fills the candidate: it is the pupil
    if min(axes) / max(axes) < .4 or cv2.contourArea(contour) < 80:
        return None, True
    return dict(center=[ex, ey], axes=list(axes), angle_degrees=float(angle), confidence=pupil['confidence']), True


class DelayedHampel:
    """Emit frame t-delay after seeing frames up to t; drop centre/size spikes."""

    def __init__(self, delay=3, k=3., floor_px=6., size_ratio=.25):
        self.delay, self.k, self.floor_px, self.size_ratio = delay, k, floor_px, size_ratio
        self.buffer = deque(maxlen=2 * delay + 1)

    def reset(self):
        self.buffer.clear()

    def push(self, item):
        """item: dict with 'pupil' (or None) and arbitrary payload. Returns the delayed item or None."""
        if self.delay == 0:
            return item
        self.buffer.append(item)
        if len(self.buffer) <= self.delay:
            return None
        index = len(self.buffer) - 1 - self.delay
        target = self.buffer[index]
        pupils = [row['pupil'] for row in self.buffer if row['pupil'] is not None]
        if target['pupil'] is None or len(pupils) < max(3, self.delay + 1):
            # Too few neighbours to vouch for this frame: do not emit coordinates.
            return dict(target, pupil=None, rejected='insufficient_support' if target['pupil'] else target.get('rejected'))
        centers = np.array([p['center'] for p in pupils])
        sizes = np.array([max(p['axes']) for p in pupils])
        median_center, median_size = np.median(centers, axis=0), np.median(sizes)
        spread = 1.4826 * np.median(np.linalg.norm(centers - median_center, axis=1))
        distance = np.linalg.norm(np.array(target['pupil']['center']) - median_center)
        if distance > max(self.k * spread, self.floor_px, .25 * median_size):
            return dict(target, pupil=None, rejected='center_spike')
        if abs(max(target['pupil']['axes']) - median_size) > self.size_ratio * median_size:
            return dict(target, pupil=None, rejected='size_spike')
        return target


class VerifiedTracker:
    """Fast Orlosky proposals, DeepVOG identity checks, delayed spike rejection."""
    crop_to_aspect_ratio = staticmethod(work_image)

    def __init__(self, verify_every=3, delay=3, segmenter=None, proposer=None):
        self.engine = 'deepvog-verified'
        self.eye_sphere_adjustment_enabled = False
        self.settings = dict(pupil_min=10., pupil_max=320., verify_every=int(verify_every), delay=int(delay),
                             roi=[0., 0., 1., 1.])
        self.segmenter = segmenter if segmenter is not None else DeepVOGSegmenter()
        if proposer is None:
            from .server import load_tracker
            proposer = load_tracker('orlosky')
        self.proposer = proposer
        self.metadata = dict(engine=self.engine, work_size=[640, 480], input_kind='pupil_center_2d',
                             direction_frame='image_feature', origin_unit=None, intrinsics_measured=False,
                             confidence_kind='deepvog_identity_and_temporal_consensus',
                             proposer='orlosky', verifier='deepvog', verify_every=self.settings['verify_every'],
                             output_delay_frames=self.settings['delay'], segmenter=getattr(self.segmenter, 'metadata', {}))
        self.reset_tracking_state()

    def configure(self, settings):
        self.settings.update({k: v for k, v in settings.items() if k in self.settings})
        self.metadata.update(verify_every=int(self.settings['verify_every']), output_delay_frames=int(self.settings['delay']))
        self.reset_tracking_state()

    def reset_tracking_state(self):
        if hasattr(self.proposer, 'reset_tracking_state'):
            self.proposer.reset_tracking_state()
        self.filter = DelayedHampel(delay=int(self.settings['delay']))
        self.frame_index = 0
        self.verified = None          # last DeepVOG-confirmed pupil (center, diameter, frame)
        self.previous_gray = None
        self.last = None
        self.segmentation = None

    def _propose(self, image):
        self.proposer.eye_sphere_adjustment_enabled = False
        self.proposer.process_frame(image)
        result = self.proposer.get_last_tracking_result() or {}
        pupil = result.get('pupil_ellipse')
        if not pupil or result.get('confidence', 0.) < .5:
            return None
        return dict(center=list(map(float, pupil['center'])), axes=list(map(float, pupil['axes'])),
                    angle_degrees=float(pupil.get('angle_degrees', 0.)), confidence=float(result['confidence']))

    def _scene_changed(self, gray):
        small = cv2.resize(gray, (64, 48))
        changed = False
        if self.previous_gray is not None:
            changed = float(np.mean(cv2.absdiff(small, self.previous_gray))) > 40
        self.previous_gray = small
        return changed

    def _gate(self, proposal):
        """Between DeepVOG runs: same pupil size and a plausible position."""
        if proposal is None or self.verified is None:
            return False
        center, diameter, frame = self.verified
        age = max(1, self.frame_index - frame)
        size = max(proposal['axes'])
        if not .7 * diameter <= size <= 1.4 * diameter:
            return False
        # Saccades move fast; allow roughly one pupil diameter per few frames.
        return np.linalg.norm(np.array(proposal['center']) - center) <= diameter * (.6 + .3 * age)

    def process_frame(self, image):
        gray = cv2.cvtColor(work_image(image), cv2.COLOR_BGR2GRAY)
        if self._scene_changed(gray):
            # Camera re-seated / video cut: never carry an old pupil identity across.
            self.verified = None
            self.filter.reset()
        proposal, refined = dark_core(gray, self._propose(image))
        scheduled = self.verified is None or self.frame_index % max(1, int(self.settings['verify_every'])) == 0
        pupil, source, support = None, None, None
        if not scheduled and self._gate(proposal):
            pupil, source = proposal, 'orlosky_size_gated'
        else:
            # Scheduled check, or the fast proposal failed the gate: ask DeepVOG now.
            probability = self.segmenter(gray)
            # Preview expects 640×480 integer class labels (3 = pupil), not probabilities.
            self.segmentation = cv2.resize(np.uint8(probability >= .5) * 3, (640, 480),
                                           interpolation=cv2.INTER_NEAREST)
            segmented, _ = dark_core(gray, pupil_from_probability(probability))
            if proposal is not None:
                support = ellipse_support(probability, proposal)
            if proposal is not None and support >= .5 and (segmented is None or
                    .6 <= max(proposal['axes']) / max(segmented['axes']) <= 1.6):
                pupil, source = proposal, 'orlosky_confirmed_by_deepvog'
            elif segmented is not None and segmented['confidence'] >= .6:
                pupil, source = segmented, 'deepvog_segmentation'
            if pupil is not None:
                self.verified = (np.array(pupil['center']), max(pupil['axes']), self.frame_index)
        l, t, r, b = np.array(self.settings['roi']) * [640, 480, 640, 480]
        if pupil is not None and (not self.settings['pupil_min'] <= max(pupil['axes']) <= self.settings['pupil_max']
                                  or not (l <= pupil['center'][0] <= r and t <= pupil['center'][1] <= b)):
            pupil, source = None, None
        item = dict(frame=self.frame_index, pupil=pupil, source=source, support=support, dark_core_refined=refined,
                    rejected=None if pupil else ('no_identity' if proposal else 'no_candidate'))
        self.frame_index += 1
        out = self.filter.push(item)
        self._publish(out)

    def _publish(self, item):
        details = dict(self.metadata, settings=dict(self.settings), predicted=False, fresh_detector=True)
        self.last = dict(confidence=0., direction=None, ready=False, pupil_ellipse=None, tracker_details=details)
        if item is None:
            self.last['tracker_error'] = '지연 필터 준비 중'
            return
        details.update(source_frame=item['frame'], pupil_source=item['source'], deepvog_support=item['support'],
                       rejected=item.get('rejected'))
        pupil = item['pupil']
        if pupil is None:
            self.last['tracker_error'] = {'center_spike': '동공 위치 급변 프레임 제외', 'size_spike': '동공 크기 급변(홍채 의심) 프레임 제외',
                                          'no_identity': 'DeepVOG가 동공으로 확인하지 못함', 'insufficient_support': '주변 프레임 부족'}.get(
                                              item.get('rejected'), '동공 후보 없음')
            return
        cx, cy = pupil['center']
        self.last.update(confidence=max(.65, min(1., pupil['confidence'])), ready=self.verified is not None,
                         pupil_ellipse=dict(center=[cx, cy], axes=pupil['axes'], angle_degrees=pupil['angle_degrees']),
                         raw=[(cx / 640 - .5) * 2, (.5 - cy / 480) * 2])

    def get_last_tracking_result(self):
        return self.last


class DeepVOGSegmenter:
    """Official DeepVOG network + weights (via research.py), returns 240x320 pupil probability."""

    def __init__(self):
        os.environ.setdefault('KERAS_BACKEND', 'torch')
        from .research import DeepVOGTracker, MODELS, model_path, torch_runtime
        self.torch, device = torch_runtime()
        from .vendor.deepvog.DeepVOG_model import DeepVOG_net
        path = model_path('DeepVOG_weights.h5')
        self.net = DeepVOG_net(input_shape=(240, 320, 3), filter_size=(10, 10))
        self.net.load_weights(str(path))
        self.net.to(device)
        self.metadata = dict(upstream='https://github.com/pydsgz/DeepVOG', model_sha256=MODELS[path.name][1], device=device)

    def __call__(self, gray640):
        gray = cv2.resize(gray640, (320, 240), interpolation=cv2.INTER_AREA)
        data = np.repeat(gray[None, :, :, None], 3, axis=3).astype(np.float32) / 255.
        with self.torch.inference_mode():
            return self.net(data, training=False).detach().cpu().numpy()[0, :, :, 1]
