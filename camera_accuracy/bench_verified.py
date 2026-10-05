"""Stability replay for the DeepVOG-verified route (no gaze ground truth).

    python -m camera_accuracy.bench_verified --video exhibition/assets/eye_test.mp4 \
        --cache /tmp/deepvog-cache.npz --baseline /tmp/baseline.json --output /tmp/verified-bench.json

``--cache`` holds DeepVOG probabilities per frame; it is created automatically when
the file does not exist (DeepVOG takes ~1 s/frame on CPU, ~0.1 s on Apple MPS). ``--baseline`` is the JSON written by
compare_detectors for the classical engines on the same video.

Metrics are stability, not accuracy: valid frames, >32px centre jumps, pupil-size
switches (iris suspicion), high-frequency residual vs. a 5-frame median, and the
share of 1.2 s windows that would pass capture() (>=12 valid, p90 <= 0.08) when the
feed is randomly thinned to 13-18 FPS.
"""
import argparse
import json
import os
import random
import time

import cv2
import numpy as np


def load_frames(path):
    cap, frames = cv2.VideoCapture(path), []
    while True:
        ok, image = cap.read()
        if not ok:
            return frames, cap.get(cv2.CAP_PROP_FPS) or 24.
        frames.append(image)


def scene_cuts(frames):
    from .detectors import work_image
    cuts, previous = [0], None
    for index, image in enumerate(frames):
        small = cv2.resize(cv2.cvtColor(work_image(image), cv2.COLOR_BGR2GRAY), (64, 48))
        if previous is not None and float(np.mean(cv2.absdiff(small, previous))) > 40:
            cuts.append(index)
        previous = small
    return cuts


def series(observations, count, delayed=False):
    """Per source frame: (center, diameter) or None."""
    out = [None] * count
    for index, row in enumerate(observations):
        if not row or not row.get('pupil_ellipse') or row.get('confidence', 0) < .65:
            continue
        source = row.get('tracker_details', {}).get('source_frame', index) if delayed else index
        pupil = row['pupil_ellipse']
        out[source] = (np.array(pupil['center'], float), float(max(pupil['axes'])))
    return out


def metrics(values, cuts, fps, seed=0):
    shot = np.searchsorted(cuts, np.arange(len(values)), side='right')
    valid = [v is not None for v in values]
    jumps = pairs = 0
    for i in range(1, len(values)):
        if values[i] and values[i - 1] and shot[i] == shot[i - 1]:
            pairs += 1
            jumps += np.linalg.norm(values[i][0] - values[i - 1][0]) > 32
    residuals, switches = [], 0
    for i, v in enumerate(values):
        if v is None:
            continue
        near = [values[j] for j in range(max(0, i - 2), min(len(values), i + 3))
                if values[j] is not None and shot[j] == shot[i]]
        if len(near) >= 3:
            residuals.append(float(np.linalg.norm(v[0] - np.median([n[0] for n in near], axis=0))))
        window = [values[j][1] for j in range(max(0, i - 7), min(len(values), i + 8))
                  if values[j] is not None and shot[j] == shot[i]]
        if len(window) >= 5 and abs(v[1] - np.median(window)) > .4 * np.median(window):
            switches += 1
    # Capture windows: 1.2 s, feed thinned to 13-18 FPS like the unstable USB/Pi input.
    rng = random.Random(seed)
    length, passed, total, enough = int(round(1.2 * fps)), 0, 0, 0
    for start in range(0, len(values) - length, 6):
        if shot[start] != shot[start + length - 1]:
            continue
        keep = rng.uniform(13, 18) / fps
        raw = [values[i][0] / [320, -240] for i in range(start, start + length)
               if rng.random() < keep and values[i] is not None]
        total += 1
        if len(raw) >= 12:
            enough += 1
            raw = np.array(raw)
            if np.percentile(np.linalg.norm(raw - np.median(raw, axis=0), axis=1), 90) <= .08:
                passed += 1
    return dict(valid_frames=int(sum(valid)), consecutive_pairs=pairs, jumps_over_32px=int(jumps),
                size_switches=switches,
                hf_residual_px_median=float(np.median(residuals)) if residuals else None,
                hf_residual_px_p95=float(np.percentile(residuals, 95)) if residuals else None,
                capture_windows=total, windows_with_12_valid=enough / total if total else None,
                capture_window_pass_rate=passed / total if total else None)


class CachedSegmenter:
    metadata = dict(source='cache')

    def __init__(self, probability):
        self.probability, self.index, self.calls = probability, 0, 0

    def __call__(self, gray):
        self.calls += 1
        return self.probability[self.index].astype(np.float32)


def run_chanwoo_deepvog(frames, probability):
    """Replay research.DeepVOGTracker with the cached network output (same post-processing)."""
    import torch
    from .research import DeepVOGTracker
    tracker = DeepVOGTracker.__new__(DeepVOGTracker)
    from .routes import StableOrlosky
    StableOrlosky.__init__(tracker, 'deepvog')
    tracker.settings.update(auto_intensity=False)
    tracker.torch = torch
    state = dict(i=0)
    full = np.zeros((1, 240, 320, 3), np.float32)
    tracker.net = lambda data, training=False: torch.from_numpy(
        np.concatenate([full[..., :1], probability[state['i']].astype(np.float32)[None, :, :, None], full[..., :1]], axis=3))
    out = []
    for i, image in enumerate(frames):
        state['i'] = i
        tracker.process_frame(image)
        out.append(tracker.get_last_tracking_result())
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--video', default='exhibition/assets/eye_test.mp4')
    parser.add_argument('--cache', required=True)
    parser.add_argument('--baseline', help='compare_detectors JSON for classical engines on the same video')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    frames, fps = load_frames(args.video)
    if not os.path.exists(args.cache):
        from .detectors import work_image
        from .verified import DeepVOGSegmenter
        segmenter = DeepVOGSegmenter()
        maps = []
        for index, image in enumerate(frames):
            maps.append(segmenter(cv2.cvtColor(work_image(image), cv2.COLOR_BGR2GRAY)).astype(np.float16))
            if index % 100 == 0:
                print(f'DeepVOG cache {index}/{len(frames)}', flush=True)
        np.savez_compressed(args.cache, prob=np.array(maps))
    probability = np.load(args.cache)['prob']
    assert len(probability) == len(frames), 'cache/video frame count mismatch'
    cuts = scene_cuts(frames)
    observations, delayed, timing = {}, set(), {}
    if args.baseline:
        base = json.load(open(args.baseline))
        observations.update(base['observations'])
    observations['deepvog (chanwoo research.py)'] = run_chanwoo_deepvog(frames, probability)

    from .verified import VerifiedTracker, pupil_from_probability
    standalone = []
    for p in probability:
        pupil = pupil_from_probability(p.astype(np.float32))
        standalone.append(dict(pupil_ellipse=pupil, confidence=max(.65, pupil['confidence']) if pupil and pupil['confidence'] >= .6 else 0.))
    observations['deepvog blob (verified.py, no filter)'] = standalone

    from .server import load_tracker
    for every, delay in ((1, 0), (1, 3), (3, 3), (6, 3)):
        segmenter = CachedSegmenter(probability)
        tracker = VerifiedTracker(verify_every=every, delay=delay, segmenter=segmenter, proposer=load_tracker('orlosky'))
        rows, started = [], time.perf_counter()
        for i, image in enumerate(frames):
            segmenter.index = i
            tracker.process_frame(image)
            rows.append(tracker.get_last_tracking_result())
        name = f'verified every={every} delay={delay}'
        observations[name], timing[name] = rows, dict(deepvog_calls=segmenter.calls, frames=len(frames))
        delayed.add(name)
    summary, per_frame = {}, {}
    for name, rows in observations.items():
        values = series(rows, len(frames), name in delayed)
        per_frame[name] = [None if v is None else [round(float(v[0][0]), 1), round(float(v[0][1]), 1), round(v[1], 1)] for v in values]
        summary[name] = metrics(values, cuts, fps)
        summary[name].update(timing.get(name, {}))
        print(f"{name:40s} " + ' '.join(f'{k}={v:.3f}' if isinstance(v, float) else f'{k}={v}' for k, v in summary[name].items()))
    json.dump(dict(video=args.video, frames=len(frames), fps=fps, scene_cuts=cuts, summary=summary, per_frame=per_frame,
                   scope='Unlabeled montage video. Stability metrics only; not gaze or pupil-centre accuracy.'),
              open(args.output, 'w'), indent=1)


if __name__ == '__main__':
    main()
