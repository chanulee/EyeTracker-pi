"""Compare local detector throughput/outputs, never claim unlabeled gaze accuracy."""
import argparse
import json
from pathlib import Path
import time

import cv2
import numpy as np

from .server import load_tracker
from .gaze import fit_calibration


def replay_calibration(video, outputs):
    """Replay the original capture windows, without using original valid-frame gates."""
    directory = Path(video).parent
    tracking, sidecar = directory / 'tracking.jsonl', Path(video).with_name(Path(video).stem + '-frames.jsonl')
    if not tracking.exists() or not sidecar.exists():
        return None
    logs = [json.loads(line) for line in tracking.read_text().splitlines()]
    video_frames = [json.loads(line) for line in sidecar.read_text().splitlines()]
    captures = [row for row in logs if row['type'] == 'capture_result' and row['result']['action'] == 'sample']
    results = {}
    for engine, observations in outputs.items():
        medians, targets, trials, windows = {}, {}, [], []
        for capture in captures:
            sample = capture['result']
            start, end = sample['timestamp_ms'], capture['timestamp_ms']
            raw = []
            for frame in video_frames:
                index = frame['video_frame_index']
                if index >= len(observations) or not start <= frame['timestamp_ms'] <= end:
                    continue
                row = observations[index]
                if not row or not row.get('pupil_ellipse') or row['confidence'] < .65:
                    continue
                details = row.get('tracker_details', {})
                if (details.get('predicted') or not details.get('fresh_detector', True) or
                        details.get('temporal_source') == 'verified_optical_flow' or
                        (details.get('reference_required') and not details.get('motion_valid'))):
                    continue
                if engine.endswith('-3d') and not row.get('ready'):
                    continue
                # Isolate detector quality: baseline's virtual eye was not calibrated in this PuRe recording.
                center = row['pupil_ellipse']['center']
                value = [(center[0] / 640 - .5) * 2, (.5 - center[1] / 480) * 2] if engine == 'orlosky' else row.get('raw')
                if value is None and row.get('direction') is not None:
                    value = row['direction'][:2]
                if value is not None:
                    raw.append(value)
            median = np.median(raw, axis=0).tolist() if len(raw) >= 12 else None
            p90 = float(np.percentile(np.linalg.norm(np.asarray(raw)-median, axis=1), 90)) if median else None
            stable = median is not None and p90 <= .08
            windows.append(dict(index=sample['index'], valid_frames=len(raw), raw_median=median, raw_p90=p90))
            if sample['index'] < 8:
                # A retry replaces that target, rather than becoming an extra calibration point.
                if stable:
                    medians[sample['index']] = median
                    targets[sample['index']] = sample['target']
            else:
                if len(medians) != 8 or not stable:
                    trial = dict(passed=False, error='At least one window has insufficient or unstable valid/ready frames')
                else:
                    try:
                        fit = fit_calibration([*(medians[i] for i in range(8)), median],
                                              [*(targets[i] for i in range(8)), sample['target']])
                        trial = dict(passed=True, fit_error=fit['fit_error'], loo_max_error=fit['loo_max_error'])
                    except ValueError as error:
                        trial = dict(passed=False, error=str(error))
                trials.append(trial)
        results[engine] = dict(windows=windows, trials=trials)
    return dict(scope='Training-fit replay only, not independent screen accuracy. Baseline uses final pupil center as 2D feature to isolate detector quality; its virtual sphere was not calibrated in this PuRe recording. 3D requires model ready. Source capture windows retained.', engines=results)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--video', default='exhibition/assets/eye_test.mp4')
    parser.add_argument('--frames', type=int, default=120)
    parser.add_argument('--output', default='camera_accuracy/detector-comparison.json')
    parser.add_argument('--engines', nargs='+', default=['orlosky', 'orlosky-stable', 'orlosky-stable-3d', 'ritnet', 'pure-st'])
    parser.add_argument('--recorded-state', action='store_true', help='Replay recorded calibration freeze flags; pre-recording tracker history is unavailable')
    parser.add_argument('--compensate-motion', action='store_true', help='Enable experimental skin translation compensation for Route D')
    parser.add_argument('--reference-frame', type=int, help='Fixed neutral image frame for ECC/TAPIR replay; no gaze labels select it')
    args = parser.parse_args()
    if args.frames < 1:
        parser.error('--frames must be positive')
    cap = cv2.VideoCapture(args.video)
    video_fps = cap.get(cv2.CAP_PROP_FPS) or 20.
    sidecar = Path(args.video).with_name(Path(args.video).stem + '-frames.jsonl')
    clock = [json.loads(line)['capture_return_monotonic_s'] for line in sidecar.read_text().splitlines()] if sidecar.exists() else None
    tracking = Path(args.video).parent / 'tracking.jsonl'
    states = {row['video_frame_index']: row.get('calibrating', False)
              for row in (json.loads(line) for line in tracking.read_text().splitlines())
              if row['type'] == 'frame' and row.get('video_frame_index') is not None} if args.recorded_state and tracking.exists() else {}
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
    outputs = {}
    for engine in args.engines:
        tracker = load_tracker(engine)
        if engine == 'orlosky-flow':
            tracker.settings['compensate_motion'] = args.compensate_motion
        tracker.eye_sphere_adjustment_enabled = engine.endswith('-3d')
        timings, observations = [], []
        for index, image in enumerate(frames):
            tracker.calibration_active = states.get(index, False)
            tracker.frame_timestamp = clock[index] if clock and index < len(clock) else index / video_fps
            started = time.perf_counter()
            tracker.process_frame(image)
            if args.reference_frame == index and hasattr(tracker, 'capture_reference'):
                tracker.capture_reference()
            timings.append((time.perf_counter() - started) * 1000)
            observations.append(tracker.get_last_tracking_result())
        candidates = sum(bool(row and row.get('pupil_ellipse')) for row in observations)
        accepted = sum(bool(row and row.get('pupil_ellipse') and row['confidence'] >= .65) for row in observations)
        fresh = sum(bool(row and row.get('pupil_ellipse') and row['confidence'] >= .65 and
                         row.get('tracker_details', {}).get('fresh_detector', True) and
                         not row.get('tracker_details', {}).get('predicted')) for row in observations)
        pairs = [(a['pupil_ellipse']['center'], b['pupil_ellipse']['center']) for a, b in zip(observations, observations[1:])
                 if a and b and a.get('pupil_ellipse') and b.get('pupil_ellipse') and min(a['confidence'], b['confidence']) >= .65]
        jumps = sum(np.linalg.norm(np.array(a) - b) > 32 for a, b in pairs)
        summary = dict(engine=engine, frames=len(frames), candidates=candidates, accepted=accepted, fresh_detector_frames=fresh,
                       ready_frames=sum(bool(row and row.get('ready')) for row in observations),
                       consecutive_pairs=len(pairs), jumps_over_32px=int(jumps),
                       median_ms=float(np.median(timings)), p95_ms=float(np.percentile(timings, 95)), first=observations[0])
        outputs[engine] = observations
        summaries.append(summary)
        print(f'{engine}: {accepted}/{len(frames)} accepted by bench; median {summary["median_ms"]:.2f} ms')
    result = dict(video=args.video, recorded_calibration_state=args.recorded_state, compensate_motion=args.compensate_motion,
                  reference_frame=args.reference_frame,
                  scope='Unlabeled input; acceptance is not accuracy or recall. Confidence differs across engines. Pre-recording tracking history is unavailable. 3D uses recorded capture timestamps when present, otherwise nominal video time.', summaries=summaries, observations=outputs,
                  calibration_replay=replay_calibration(args.video, outputs))
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n')


if __name__ == '__main__':
    main()
