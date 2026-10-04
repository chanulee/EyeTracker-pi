"""Replay existing pupil observations with feed-only reference features.

Run: camera_accuracy/.venv/bin/python camera_accuracy/diagnostics/markerless/practice.py RECORDING_DIRECTORY
No application changes; no below-eye bright spots are used.
Historical reflection experiment: the wearer reports glasses reflections.
Bright blobs are not verified corneal glints; this is not the exhibition baseline.
"""
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from camera_accuracy.gaze import POINTS, features


def glint(gray, pupil, threshold=130):
    if pupil is None:
        return None
    center = np.array(pupil['center']) / 2
    yy, xx = np.indices(gray.shape)
    mask = np.uint8(gray > threshold)
    mask[(xx-center[0])**2 + (yy-center[1])**2 > 35**2] = 0
    mask[170:] = 0
    count, _, stats, centers = cv2.connectedComponentsWithStats(mask)
    candidates = [k for k in range(1, count) if 2 <= stats[k, 4] <= 80
                  and max(stats[k, 2:4]) <= 14 and np.linalg.norm(centers[k]-center) < 28]
    # ponytail: brightest compact blob can be a spurious reflection; temporal identity checks are required for live use.
    return centers[max(candidates, key=lambda k: stats[k, 4])] if candidates else None


def fit(points):
    points = np.array(points)
    design = features((points-points.mean(0))/points.std(0))
    weights = np.linalg.lstsq(design, POINTS, rcond=None)[0]
    errors = np.linalg.norm(design@weights-POINTS, axis=1)
    loo = [float(np.linalg.norm(design[i]@np.linalg.lstsq(
        np.delete(design, i, 0), np.delete(POINTS, i, 0), rcond=None)[0]-POINTS[i])) for i in range(9)]
    return dict(errors=errors.tolist(), max_error=float(errors.max()), loo_max_error=max(loo))


def main():
    source, output = Path(sys.argv[1]), Path(__file__).resolve().parent
    logs = [json.loads(line) for line in (source/'tracking.jsonl').read_text().splitlines()]
    frames = [row for row in logs if row['type'] == 'frame']
    captures = [row for row in logs if row['type'] == 'capture_result'][-9:]
    assert [row['result']['index'] for row in captures] == list(range(9))
    video = cv2.VideoCapture(str(source/'camera-01.avi'))
    images = []
    try:
        while True:
            ok, image = video.read()
            if not ok:
                break
            images.append(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY))
    finally:
        video.release()
    assert len(images) == len(frames)
    windows = [[row['video_frame_index'] for row in frames if capture['result']['timestamp_ms']
                <= row['timestamp_ms'] <= capture['timestamp_ms'] and row['tracking']] for capture in captures]
    pupils = [np.array(row['detection']['pupil_ellipse']['center'])/2 if row['tracking'] else None for row in frames]
    original = fit([np.median([pupils[i] for i in window], 0) for window in windows])
    experiments = {}
    tracks = {}
    for threshold in (120, 130, 140):
        refs = [glint(image, row['detection'].get('pupil_ellipse'), threshold) for image, row in zip(images, frames)]
        kept = [[i for i in window if refs[i] is not None] for window in windows]
        relative = [np.median([pupils[i]-refs[i] for i in window], 0).tolist() for window in kept]
        experiments[f'PCCR_{threshold}'] = dict(counts=[len(window) for window in kept],
            centers=relative, fit=fit(relative), original_same_subset=fit([
                np.median([pupils[i] for i in window], 0) for window in kept]),
            fresh_detector_counts=[sum(frames[i]['detection']['tracker_details']['temporal_source']
                                      != 'verified_optical_flow' for i in window) for window in kept],
            raw_p90=[float(np.percentile(np.linalg.norm(
                (np.array([pupils[i]-refs[i] for i in window])-median)/[160, 120], axis=1), 90))
                for window, median in zip(kept, relative)])
        tracks[threshold] = refs
    # Natural texture registration; the reference is during the second neutral fixation.
    reference_index = 560
    reference = images[reference_index]
    mask = np.zeros(reference.shape, np.uint8)
    mask[5:65, 20:310] = 255
    mask[65:155, :35] = 255
    mask[65:155, 305:] = 255
    mask[155:205, 10:100] = 255
    assert not mask[205:].any() and not mask[65:155, 35:305].any()
    warp = np.eye(2, 3, dtype=np.float32)
    shifts, scores, timings = {}, [], []
    for index in range(reference_index, 980):
        started = time.perf_counter()
        try:
            score, candidate = cv2.findTransformECC(reference, images[index], warp.copy(), cv2.MOTION_TRANSLATION,
                (cv2.TERM_CRITERIA_COUNT | cv2.TERM_CRITERIA_EPS, 30, 1e-4), mask, 5)
            if score > .8:
                warp = candidate
                shifts[index] = warp[:, 2].tolist()
            scores.append(float(score))
        except cv2.error:
            pass
        timings.append((time.perf_counter()-started)*1000)
    kept = [[i for i in window if i in shifts] for window in windows]
    relative = [np.median([pupils[i]-shifts[i] for i in window], 0).tolist() for window in kept]
    experiments['texture_ECC'] = dict(counts=[len(window) for window in kept], centers=relative, fit=fit(relative),
        reference_index=reference_index, evaluated_frames=420, accepted=len(shifts),
        median_ms=float(np.median(timings)), p95_ms=float(np.percentile(timings, 95)), shifts=shifts)
    # One runnable check: a known image translation must preserve the PCCR feature,
    # and ECC must recover the translation within one sensor pixel on this image.
    checks = []
    for dx, dy in ((3, 0), (0, -3), (3, 3), (-3, -3)):
        shift = np.array([dx, dy])
        moved = cv2.warpAffine(reference, np.array([[1, 0, dx], [0, 1, dy]], np.float32),
                              (320, 240), borderMode=cv2.BORDER_REFLECT)
        pupil = frames[reference_index]['detection']['pupil_ellipse']
        shifted_pupil = dict(pupil, center=(np.array(pupil['center'])+shift*2).tolist())
        before, after = glint(reference, pupil), glint(moved, shifted_pupil)
        assert before is not None and after is not None
        assert np.linalg.norm(after-before-shift) < 1e-6
        _, estimate = cv2.findTransformECC(reference, moved, np.eye(2, 3, dtype=np.float32), cv2.MOTION_TRANSLATION,
            (cv2.TERM_CRITERIA_COUNT | cv2.TERM_CRITERIA_EPS, 50, 1e-5), mask, 5)
        error = float(np.linalg.norm(estimate[:, 2]-shift))
        assert error < 1., error
        checks.append(dict(shift=shift.tolist(), ecc_error_sensor_px=error))
    report = dict(source=str(source), original_fit=original, experiments=experiments, translation_checks=checks,
        limitations='Training-fit replay only; no independent 4-point validation. Recorded pupil detections include optical-flow-only estimates. Glint identity and actual camera/light motion are not ground truth. Synthetic shifts test feature extraction with known pupil centers, not end-to-end pupil detection.')
    (output/'results.json').write_text(json.dumps(report, indent=2)+'\n')
    tiles = []
    for index in (597, 643, 688, 733, 778, 822, 867, 907, 949):
        image = cv2.cvtColor(cv2.resize(images[index], (640, 480)), cv2.COLOR_GRAY2BGR)
        pupil = frames[index]['detection'].get('pupil_ellipse')
        if pupil:
            cv2.ellipse(image, (tuple(pupil['center']), tuple(pupil['axes']), pupil['angle_degrees']), (0, 255, 0), 2)
        ref = tracks[130][index]
        if ref is not None:
            point = tuple(np.rint(ref*2).astype(int))
            cv2.drawMarker(image, point, (0, 0, 255), cv2.MARKER_CROSS, 15, 2)
            cv2.line(image, tuple(np.rint(pupil['center']).astype(int)), point, (0, 255, 255), 1)
        cv2.putText(image, f'f{index}: pupil green / reflection red', (8, 24), cv2.FONT_HERSHEY_SIMPLEX, .5, (0, 255, 255), 1)
        tiles.append(cv2.resize(image, (480, 360)))
    cv2.imwrite(str(output/'glint-overlays.jpg'), np.vstack([np.hstack(tiles[i:i+3]) for i in range(0, 9, 3)]))
    print('Original:', original)
    for name, result in experiments.items():
        print(name, result['counts'], result['fit'])
    print('Known translation checks:', checks)


if __name__ == '__main__':
    main()
