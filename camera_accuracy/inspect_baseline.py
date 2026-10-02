"""Reproduce detector center mismatch without a camera or gaze ground truth."""
import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np

from .server import HERE, load_tracker


def inspect(video, frame_count=120):
    tracker = load_tracker()
    tracker.eye_sphere_adjustment_enabled = False  # Deterministic; random model fitting is disabled.
    original = tracker.compute_gaze_vector
    used = []

    def record(x, y, *args, **kwargs):
        used.append([x, y])
        return original(x, y, *args, **kwargs)

    tracker.compute_gaze_vector = record
    cap = cv2.VideoCapture(str(video))
    deltas, examples = [], []
    processed = 0
    try:
        if not cap.isOpened():
            raise ValueError(f'눈 영상을 열 수 없습니다: {video}')
        for i in range(frame_count):
            ok, image = cap.read()
            if not ok:
                break
            processed += 1
            used.clear()
            tracker.process_frame(image)
            result = tracker.get_last_tracking_result()
            if used and result and result.get('pupil_ellipse'):
                ellipse = result['pupil_ellipse']['center']
                delta = float(np.linalg.norm(np.asarray(used[-1]) - ellipse))
                deltas.append(delta)
                if len(examples) < 3:
                    examples.append(dict(frame=i, gaze_input=used[-1], final_ellipse_center=ellipse, difference_px=delta))
    finally:
        cap.release()
    tracker.max_observed_distance = 1.
    direction1 = original(283, 209, 320, 240)[1]
    tracker.max_observed_distance = 1000.
    direction2 = original(283, 209, 320, 240)[1]
    return dict(video=str(video), tracker_sha256=hashlib.sha256((HERE / 'tracking/Orlosky3DEyeTracker.py').read_bytes()).hexdigest(),
        frames=processed, detected_frames=len(deltas),
        center_difference_median_px=float(np.median(deltas)) if deltas else None,
        center_difference_max_px=max(deltas) if deltas else None,
        adaptive_radius_changes_direction=not bool(np.allclose(direction1, direction2)), examples=examples)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--video', default=str(HERE.parent / 'exhibition/assets/eye_test.mp4'))
    parser.add_argument('--frames', type=int, default=120)
    parser.add_argument('--output', help='Optional JSON output path')
    args = parser.parse_args()
    if args.frames < 1:
        parser.error('--frames는 1 이상입니다')
    report = inspect(args.video, args.frames)
    encoded = json.dumps(report, indent=2) + '\n'
    print(encoded)
    if args.output:
        Path(args.output).write_text(encoded)
