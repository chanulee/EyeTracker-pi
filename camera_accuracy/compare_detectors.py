"""Compare local detector throughput/outputs, never claim unlabeled gaze accuracy."""
import argparse
import json
from pathlib import Path
import time

import cv2
import numpy as np

from .server import load_tracker


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--video', default='exhibition/assets/eye_test.mp4')
    parser.add_argument('--frames', type=int, default=120)
    parser.add_argument('--output', default='camera_accuracy/detector-comparison.json')
    args = parser.parse_args()
    if args.frames < 1:
        parser.error('--frames must be positive')
    cap = cv2.VideoCapture(args.video)
    frames = []
    try:
        for _ in range(args.frames):
            ok, image = cap.read()
            if not ok:
                break
            frames.append(image)
    finally:
        cap.release()
    if not frames:
        parser.error('No readable video frames')
    summaries = []
    for engine in ('orlosky', 'pupil-2d', 'pure', 'else'):
        tracker = load_tracker(engine)
        tracker.eye_sphere_adjustment_enabled = False
        timings, observations = [], []
        for image in frames:
            started = time.perf_counter()
            tracker.process_frame(image)
            timings.append((time.perf_counter() - started) * 1000)
            observations.append(tracker.get_last_tracking_result())
        candidates = sum(bool(row and row.get('pupil_ellipse')) for row in observations)
        accepted = sum(bool(row and row.get('pupil_ellipse') and row['confidence'] >= .65) for row in observations)
        summary = dict(engine=engine, frames=len(frames), candidates=candidates, accepted=accepted,
                       median_ms=float(np.median(timings)), p95_ms=float(np.percentile(timings, 95)), first=observations[0])
        summaries.append(summary)
        print(f'{engine}: {accepted}/{len(frames)} accepted by bench; median {summary["median_ms"]:.2f} ms')
    result = dict(video=args.video, scope='Unlabeled input; acceptance is not accuracy or recall. Confidence differs across engines.', summaries=summaries)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n')


if __name__ == '__main__':
    main()
