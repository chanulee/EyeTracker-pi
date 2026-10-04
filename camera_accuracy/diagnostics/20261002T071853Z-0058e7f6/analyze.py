"""Offline diagnosis, not a gaze calibration implementation.

Run from the repository root:
camera_accuracy/.venv/bin/python camera_accuracy/diagnostics/20261002T071853Z-0058e7f6/analyze.py /path/to/recording
"""
import json
import sys
from collections import Counter
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from camera_accuracy.gaze import POINTS, features


def fit_diagnostics(points):
    points = np.asarray(points)
    design = features((points - points.mean(0)) / points.std(0))
    weights = np.linalg.lstsq(design, POINTS, rcond=None)[0]
    errors = np.linalg.norm(design @ weights - POINTS, axis=1)
    loo = [float(np.linalg.norm(design[i] @ np.linalg.lstsq(
        np.delete(design, i, 0), np.delete(POINTS, i, 0), rcond=None)[0] - POINTS[i])) for i in range(9)]
    return dict(max_error=float(errors.max()), errors=errors.tolist(), loo_errors=loo,
                condition=float(np.linalg.cond(design)))


def main():
    source, output = Path(sys.argv[1]), Path(__file__).resolve().parent
    logs = [json.loads(line) for line in (source / 'tracking.jsonl').read_text().splitlines()]
    frames = [row for row in logs if row['type'] == 'frame']
    sidecar = [json.loads(line) for line in (source / 'camera-01-frames.jsonl').read_text().splitlines()]
    assert len(frames) == len(sidecar)
    assert all(a['seq'] == b['seq'] and a['video_frame_index'] == b['video_frame_index']
               for a, b in zip(frames, sidecar))
    captures = [row for row in logs if row['type'] == 'capture_result'][-9:]
    assert [row['result']['index'] for row in captures] == list(range(9))
    windows = [[row for row in frames if capture['result']['timestamp_ms'] <= row['timestamp_ms']
                <= capture['timestamp_ms'] and row['tracking']] for capture in captures]
    assert all(len(window) == capture['result']['valid_frames'] for window, capture in zip(windows, captures))
    pupils = [np.median([row['detection']['pupil_ellipse']['center'] for row in window], 0) / 2
              for window in windows]
    expected = [(np.array(row['result']['raw_median']) * [1, -1] + 1) * [160, 120]
                for row in captures]
    assert np.allclose(pupils, expected)
    # Fixed bright regions below the eye are a diagnostic reference only.
    # Their physical attachment is unknown; do not reuse this as production motion compensation.
    reference_tracks = {threshold: [] for threshold in (200, 210)}
    video = cv2.VideoCapture(str(source / 'camera-01.avi'))
    try:
        while True:
            ok, image = video.read()
            if not ok:
                break
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            for threshold, track in reference_tracks.items():
                mask = np.uint8(gray > threshold)
                mask[:155] = 0
                count, _, stats, centers = cv2.connectedComponentsWithStats(mask)
                blobs = [centers[k] for k in range(1, count) if 50 <= stats[k, 4] <= 600
                         and 100 < centers[k, 0] < 260 and 8 <= stats[k, 2] <= 30 and 8 <= stats[k, 3] <= 30]
                track.append(np.mean(blobs, 0).tolist() if len(blobs) == 2 else None)
    finally:
        video.release()
    assert all(len(track) == len(frames) for track in reference_tracks.values())
    experiments = {}
    for threshold, track in reference_tracks.items():
        relative, references, counts = [], [], []
        for window in windows:
            paired = [row for row in window if track[row['video_frame_index']] is not None]
            centers = np.array([row['detection']['pupil_ellipse']['center'] for row in paired]) / 2
            ref = np.array([track[row['video_frame_index']] for row in paired])
            counts.append(len(paired))
            relative.append(np.median(centers - ref, 0).tolist())
            references.append(np.median(ref, 0).tolist())
        assert counts == [len(window) for window in windows], 'Reference missing in a capture window'
        experiments[threshold] = dict(counts=counts, reference_centers=references,
                                     relative_centers=relative, fit=fit_diagnostics(relative))
    pairs = [(a, b) for a, b in zip(frames, frames[1:]) if a['tracking'] and b['tracking']]
    jumps = [np.linalg.norm(np.array(a['detection']['pupil_ellipse']['center'])
                            - b['detection']['pupil_ellipse']['center']) for a, b in pairs]
    report = dict(source=str(source), frames=len(frames), accepted=sum(row['tracking'] for row in frames),
                  validation_results=sum(row['type'] == 'validation_result' for row in logs),
                  skin_motion_available=sum(row['detection']['tracker_details'].get('skin_motion_px') is not None for row in frames),
                  consecutive_pairs=len(pairs), jumps_over_32_work_px=int(sum(jump > 32 for jump in jumps)),
                  frame_interval_ms=np.percentile(np.diff([row['processed_monotonic_s'] for row in frames]) * 1000,
                                                 [50, 90, 99, 100]).tolist(),
                  original_centers=[point.tolist() for point in pupils], original_fit=fit_diagnostics(pupils),
                  captures=[dict(index=i+1, valid=len(window), total=capture['result']['total_frames'],
                                 raw_p90=capture['result']['raw_p90'],
                                 sources=dict(Counter(row['detection']['tracker_details']['temporal_source'] for row in window)))
                            for i, (window, capture) in enumerate(zip(windows, captures))],
                  reference_experiments=experiments,
                  scope='Same recorded pupil observations and same quadratic regression. Training residual only; reference is not established ground truth. No independent four-point validation exists.')
    (output / 'summary.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    figure, axes = plt.subplots(1, 3, figsize=(15, 4.8), layout='constrained')
    for ax, points, title in [(axes[0], pupils, 'Recorded pupil centers'),
                              (axes[1], experiments[200]['relative_centers'], 'Pupil minus below-eye reference')]:
        points = np.array(points)
        for i, point in enumerate(points):
            ax.scatter(*point, color=('tab:blue', 'tab:orange', 'tab:green')[i//3])
            ax.annotate(str(i+1), point, xytext=(4, 4), textcoords='offset points')
        for ids in (range(3), range(3, 6), range(6, 9), (0, 3, 6), (1, 4, 7), (2, 5, 8)):
            ax.plot(*points[list(ids)].T, color='gray', alpha=.4, linestyle='--')
        ax.invert_yaxis()
        ax.set(title=title, xlabel='x (sensor pixels)', ylabel='y (sensor pixels)')
        ax.grid(alpha=.2)
    ids = np.arange(1, 10)
    axes[2].bar(ids-.18, report['original_fit']['errors'], .36, label='Original')
    axes[2].bar(ids+.18, experiments[200]['fit']['errors'], .36, label='Relative to reference')
    axes[2].axhline(.12, color='red', linestyle='--', label='Current training threshold')
    axes[2].set(xlabel='Calibration target', ylabel='Normalized training residual', xticks=ids)
    axes[2].legend(fontsize=8)
    figure.suptitle('Camera/face motion diagnostic: training fit only, no independent validation', fontsize=12)
    figure.savefig(output / 'motion-diagnostic.png', dpi=150)
    print(json.dumps({key: report[key] for key in ('frames', 'accepted', 'original_fit', 'skin_motion_available')}, indent=2))
    print('Reference diagnostic max residuals:', {k: v['fit']['max_error'] for k, v in experiments.items()})


if __name__ == '__main__':
    main()
