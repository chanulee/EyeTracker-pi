"""Official DeepVOG segmentation and markerless, fixed-reference image motion.

The motion feature is an exhibition experiment, not a head-pose or gaze model.
It corrects small eye-camera translations; the screen mapping still needs 9+4.
"""
import hashlib
import os
from pathlib import Path
import time

import cv2
import numpy as np

from .detectors import work_image
from .routes import StableOrlosky, tracked_translation, visible_arc

HERE = Path(__file__).parent
MODELS = {
    'DeepVOG_weights.h5': ('https://raw.githubusercontent.com/pydsgz/DeepVOG/2b8644c23e4472697c2a9949033b78af1f79e34e/deepvog/model/DeepVOG_weights.h5',
                         '7b8f68740ebd456e30c9a3e4577fd48c645e62464a773bf192844dbaf396c9eb'),
    'causal_bootstapir_checkpoint.pt': ('https://storage.googleapis.com/dm-tapnet/bootstap/causal_bootstapir_checkpoint.pt',
                                     '87c1e752cf5ce56e3e2f7da460aeb4d40fc826d04ef2939bade86a5c7495377f'),
}


def model_path(name):
    path = HERE / 'models' / name
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != MODELS[name][1]:
        raise ValueError('공식 모델 설치 필요: camera_accuracy/.venv/bin/python -m camera_accuracy.install_research')
    return path


def torch_runtime():
    # Set before torch's first import, including when switching engines in one process.
    os.environ.setdefault('PYTORCH_ENABLE_MPS_FALLBACK', '1')
    import torch
    torch.set_num_threads(2)
    return torch, 'cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu'


class DeepVOGTracker(StableOrlosky):
    def __init__(self):
        os.environ['KERAS_BACKEND'] = 'torch'
        self.torch, device = torch_runtime()
        from .vendor.deepvog.DeepVOG_model import DeepVOG_net
        super().__init__('deepvog')
        self.settings.update(auto_intensity=False)
        path = model_path('DeepVOG_weights.h5')
        self.net = DeepVOG_net(input_shape=(240, 320, 3), filter_size=(10, 10))
        self.net.load_weights(str(path))
        self.net.to(device)
        self.metadata.update(model_sha256=MODELS[path.name][1],
            upstream='https://github.com/pydsgz/DeepVOG', upstream_commit='2b8644c23e4472697c2a9949033b78af1f79e34e',
            confidence_kind='experimental_segmentation_arc', inference_size=[320, 240], device=device,
            iris_available=False, eye_model_3d=False)

    def process_frame(self, image):
        self.gray = cv2.cvtColor(work_image(image), cv2.COLOR_BGR2GRAY)
        gray = cv2.resize(self.gray, (320, 240), interpolation=cv2.INTER_AREA)
        # Same normalization / grayscale channels as upstream inferer's preprocessing.
        data = np.repeat(gray[None, :, :, None], 3, axis=3).astype(np.float32) / 255.
        with self.torch.inference_mode():
            probability = self.net(data, training=False).detach().cpu().numpy()[0, :, :, 1]
        mask = np.uint8(probability > .5) * 255
        self.segmentation = cv2.resize(np.uint8(mask > 0) * 3, (640, 480), interpolation=cv2.INTER_NEAREST)
        candidates = []
        for contour in cv2.findContours(self.segmentation, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0]:
            fitted = visible_arc(contour)
            score = self.score(fitted[0]) if fitted else None
            if score is not None:
                candidates.append((score, fitted))
        fitted = max(candidates, key=lambda row: row[0])[1] if candidates else None
        quality = min(float(probability[mask > 0].mean()), fitted[2]) if fitted else 0.
        self.publish(fitted[0] if fitted else None, quality,
            dict(predicted=False, fresh_detector=True, pupil_probability=float(probability[mask > 0].mean()) if mask.any() else 0.,
                 visible_pupil_pixels=int(np.sum(mask > 0))))


def surrounding_mask(gray, pupil):
    """Per-wearer exclusion from the current image, with no required glints."""
    center = np.asarray(pupil['center']) / 2
    diameter = max(pupil['axes']) / 2
    yy, xx = np.indices(gray.shape)
    # ponytail: a pupil-scaled exclusion can retain glasses/eyelids. Translation
    # consensus rejects deformation; semantic eye/eyewear masks need multi-user data.
    mask = np.uint8(((xx-center[0])/(4*diameter))**2 + ((yy-center[1])/(2*diameter))**2 > 1) * 255
    mask[:5] = mask[-5:] = 0
    mask[:, :5] = mask[:, -5:] = 0
    mask[cv2.dilate(np.uint8(gray > 240), np.ones((7, 7), np.uint8)) > 0] = 0
    return mask


class ReferenceTracker:
    """One shared calibration contract for ECC and official online BootsTAPIR."""
    crop_to_aspect_ratio = staticmethod(work_image)

    def __init__(self, detector, method='ecc'):
        self.detector, self.method = detector, method
        self.settings = detector.settings
        self.metadata = dict(detector.metadata, engine=detector.engine.replace('-flow', '') + '-' + method,
            motion_method=method, reference_required=True, reference_scope='current_wearer_fixed_neutral',
            motion_model='translation_only', no_glint_required=True)
        self.net = None
        if method == 'tapir':
            self.torch, self.device = torch_runtime()
            from tapnet.torch.tapir_model import TAPIR
            path = model_path('causal_bootstapir_checkpoint.pt')
            self.net = TAPIR(pyramid_level=1, use_casual_conv=True)
            self.net.load_state_dict(self.torch.load(path, map_location='cpu', weights_only=True))
            self.net.to(self.device).eval()
            self.metadata.update(motion_model_sha256=MODELS[path.name][1], motion_device=self.device,
                motion_upstream='https://github.com/google-deepmind/tapnet',
                motion_upstream_commit='730cda1c730877cfedbe01bf87fb1cadb78a565d',
                motion_checkpoint='causal_bootstapir', motion_inference_size=[256, 256])
        self.reset_tracking_state()

    def configure(self, settings):
        # The older D skin-LK switch would compensate twice. These routes own motion.
        self.detector.configure(dict(settings, compensate_motion=False))
        self.settings = self.detector.settings
        self.reset_tracking_state()

    def reset_tracking_state(self):
        self.detector.reset_tracking_state()
        self.last = self.segmentation = None
        self.clear_reference()

    def clear_reference(self):
        self.reference = self.mask = self.reference_candidate = None
        self.reference_candidate_time = 0.
        self.warp = np.eye(2, 3, dtype=np.float32)
        self.query_features = self.causal_state = None

    def seed_pupil(self, rectangle):
        self.detector.seed_pupil(rectangle)
        self.clear_reference()

    def capture_reference(self):
        if self.reference_candidate is None or time.monotonic() - self.reference_candidate_time > .35:
            raise ValueError('중앙에서 최신 동공 검출과 주변 영상이 필요합니다')
        reference, pupil = self.reference_candidate
        mask = surrounding_mask(reference, pupil)
        if np.count_nonzero(mask) < reference.size * .1 or np.std(reference[mask > 0]) < 3:
            raise ValueError('눈 주변의 무늬가 부족합니다. 초점·카메라 위치를 확인하세요')
        if self.method == 'tapir':
            points = cv2.goodFeaturesToTrack(reference, 16, .03, 12, mask=mask)
            if points is None or len(points) < 4 or np.any(np.ptp(points[:, 0], axis=0) < [32, 24]):
                raise ValueError('TAPIR가 추적할 눈 바깥의 무늬가 부족합니다')
            self.query_points = points[:, 0]
            query = np.column_stack((np.zeros(len(points)), self.query_points[:, 1] * 256/240,
                                     self.query_points[:, 0] * 256/320)).astype(np.float32)
            with self.torch.inference_mode():
                self.query_features = self.net.get_query_features(self.tapir_frame(reference), is_training=False,
                    query_points=self.torch.from_numpy(query[None]).to(self.device))
                self.causal_state = self.net.construct_initial_causal_state(len(points), len(self.query_features.resolutions)-1)
                self.causal_state = [{k: v.to(self.device) for k, v in block.items()} for block in self.causal_state]
        self.reference, self.mask = reference.copy(), mask
        self.warp = np.eye(2, 3, dtype=np.float32)
        return dict(method=self.method, reference_pixels=int(np.count_nonzero(mask)),
                    points=len(self.query_points) if self.method == 'tapir' else None)

    def tapir_frame(self, gray):
        rgb = cv2.cvtColor(cv2.resize(gray, (256, 256)), cv2.COLOR_GRAY2RGB)
        return self.torch.from_numpy((rgb.astype(np.float32)/127.5 - 1)[None, None]).to(self.device)

    def motion(self, gray, pupil):
        if self.method == 'ecc':
            seed, score = self.warp.copy(), None
            for attempt in range(2):
                # OpenCV inputMask is in CURRENT coordinates, not template coordinates.
                mask = cv2.warpAffine(self.mask, seed, (320, 240), flags=cv2.INTER_NEAREST)
                if pupil:
                    mask &= surrounding_mask(gray, pupil)
                else:
                    mask[gray > 240] = 0
                try:
                    score, candidate = cv2.findTransformECC(self.reference, gray, seed,
                        cv2.MOTION_TRANSLATION, (cv2.TERM_CRITERIA_COUNT | cv2.TERM_CRITERIA_EPS, 30, 1e-4), mask, 5)
                    shift = candidate[:, 2]
                    if score > .8 and np.all(np.abs(shift) <= [48, 36]):
                        self.warp = candidate
                        return shift, dict(motion_score=float(score), motion_reacquired=bool(attempt))
                except cv2.error:
                    pass
                if attempt == 0:
                    # ECC can fall into a local optimum after a sudden camera shift.
                    # Reuse checked LK only as a proposal against the SAME neutral image.
                    proposal = tracked_translation(self.reference, gray, self.mask)
                    if proposal is None:
                        break
                    seed = np.eye(2, 3, dtype=np.float32)
                    seed[:, 2] = proposal
            return None, dict(motion_score=float(score) if score is not None else None)
        with self.torch.inference_mode():
            output = self.net.estimate_trajectories((256, 256), is_training=False,
                feature_grids=self.net.get_feature_grids(self.tapir_frame(gray), is_training=False),
                query_features=self.query_features, query_points_in_video=None, query_chunk_size=64,
                causal_context=self.causal_state, get_causal_context=True)
            self.causal_state = output['causal_context']
            points = output['tracks'][-1][0, :, 0].cpu().numpy() * [320/256, 240/256]
            visible = ((1-self.torch.sigmoid(output['occlusion'][-1])) *
                       (1-self.torch.sigmoid(output['expected_dist'][-1])))[0, :, 0].cpu().numpy() > .5
        delta = points - self.query_points
        shift = np.median(delta[visible], axis=0) if visible.any() else np.zeros(2)
        inliers = visible & (np.linalg.norm(delta-shift, axis=1) < 2.)
        valid = (np.sum(inliers) >= 4 and np.mean(inliers) >= .6 and
                 np.all(np.ptp(self.query_points[inliers], axis=0) >= [32, 24]) and np.all(np.abs(shift) <= [48, 36]))
        return np.median(delta[inliers], axis=0) if valid else None, dict(
            motion_visible_points=int(np.sum(visible)), motion_inlier_points=int(np.sum(inliers)),
            motion_query_points=len(delta))

    def process_frame(self, image):
        self.detector.calibration_active = getattr(self, 'calibration_active', False)
        self.detector.eye_sphere_adjustment_enabled = getattr(self, 'eye_sphere_adjustment_enabled', False)
        self.detector.frame_timestamp = getattr(self, 'frame_timestamp', None)
        self.detector.process_frame(image)
        result = self.detector.get_last_tracking_result()
        self.last = dict(result)
        self.segmentation = self.detector.segmentation
        gray = cv2.resize(cv2.cvtColor(work_image(image), cv2.COLOR_BGR2GRAY), (320, 240), interpolation=cv2.INTER_AREA)
        pupil = result.get('pupil_ellipse')
        details = dict(result.get('tracker_details', {}), **self.metadata)
        fresh = bool(pupil and result['confidence'] >= .65 and not details.get('predicted') and
                     details.get('temporal_source') != 'verified_optical_flow')
        if fresh:
            self.reference_candidate = (gray.copy(), pupil)
            self.reference_candidate_time = time.monotonic()
        shift, checks = self.motion(gray, pupil) if self.reference is not None else (None, {})
        details.update(checks, fresh_detector=fresh, reference_ready=self.reference is not None,
            motion_valid=shift is not None, reference_motion_sensor_px=shift.tolist() if shift is not None else None)
        self.last['tracker_details'] = details
        if self.reference is not None:
            if shift is None:
                self.last.update(raw=None, confidence=0., ready=False,
                    tracker_error='중앙 기준 영상과 움직임이 일치하지 않습니다. 위치·가림·초점을 확인하세요')
            elif pupil:
                center = np.asarray(pupil['center'])/2 - shift
                self.last['raw'] = [(center[0]/320-.5)*2, (.5-center[1]/240)*2]

    def get_last_tracking_result(self):
        return self.last
