"""Offline comparison of natural-image references; no reflection feature or gaze labels select the mask.

Run: camera_accuracy/.venv/bin/python camera_accuracy/diagnostics/markerless/flow_research.py RECORDING_DIRECTORY
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

from practice import fit
from camera_accuracy.routes import tracked_translation


def surrounding_mask(image, pupil):
    center = np.asarray(pupil['center']) / 2
    diameter = max(pupil['axes']) / 2
    yy, xx = np.indices(image.shape)
    mask = np.uint8(((xx-center[0])/(4*diameter))**2
                    + ((yy-center[1])/(2*diameter))**2 > 1) * 255
    mask[:5] = mask[-5:] = 0
    mask[:, :5] = mask[:, -5:] = 0
    # ponytail: this pupil-scaled exclusion is only a replay heuristic; a general eye/eyewear segmentation is needed for visitors.
    glare = cv2.dilate(np.uint8(image > 240), np.ones((7, 7), np.uint8))
    mask[glare > 0] = 0
    return mask


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
    reference_index, stop = 560, 980
    reference = images[reference_index]
    mask = surrounding_mask(reference, frames[reference_index]['detection']['pupil_ellipse'])
    overlay = cv2.cvtColor(reference, cv2.COLOR_GRAY2BGR)
    overlay[mask > 0] = overlay[mask > 0]//2 + np.array([0, 100, 0], np.uint8)
    cv2.imwrite(str(output/'automatic-surrounding-mask.png'), cv2.resize(overlay, (640, 480)))
    enlarged = [cv2.resize(image, (640, 480)) for image in images]
    enlarged_mask = cv2.resize(mask, (640, 480), interpolation=cv2.INTER_NEAREST)
    experiments = {}
    for name in ('LK_keyframe_10', 'LK_keyframe_4', 'LK_incremental_4', 'ECC_automatic'):
        shifts, scores = {}, []
        warp, total = np.eye(2, 3, dtype=np.float32), np.zeros(2)
        last = reference_index
        for index in range(reference_index, stop):
            shift = None
            if name.startswith('LK'):
                previous = last if name == 'LK_incremental_4' else reference_index
                active_mask = cv2.warpAffine(mask, np.float32([[1, 0, total[0]], [0, 1, total[1]]]), (320, 240)) if previous != reference_index else mask
                active_mask = cv2.resize(active_mask, (640, 480), interpolation=cv2.INTER_NEAREST)
                delta = tracked_translation(enlarged[previous], enlarged[index], active_mask,
                                            minimum=10 if name.endswith('_10') else 4)
                if delta is not None:
                    shift = delta/2
                    if name == 'LK_incremental_4':
                        total += shift
                        shift, last = total.copy(), index
            else:
                try:
                    score, candidate = cv2.findTransformECC(reference, images[index], warp.copy(),
                        cv2.MOTION_TRANSLATION, (cv2.TERM_CRITERIA_COUNT | cv2.TERM_CRITERIA_EPS, 30, 1e-4), mask, 5)
                    scores.append(float(score))
                    if score > .8:
                        warp, shift = candidate, candidate[:, 2]
                except cv2.error:
                    pass
            if shift is not None:
                shifts[index] = shift.tolist()
        kept = [[i for i in window if i in shifts] for window in windows]
        counts = [len(window) for window in kept]
        medians = [np.median([np.asarray(frames[i]['detection']['pupil_ellipse']['center'])/2-shifts[i]
                             for i in window], axis=0).tolist() if window else None for window in kept]
        experiments[name] = dict(accepted=len(shifts), evaluated=stop-reference_index, counts=counts,
            fresh_counts=[sum(frames[i]['detection']['tracker_details']['temporal_source'] != 'verified_optical_flow'
                              for i in window) for window in kept],
            centers=medians, fit=fit(medians) if min(counts) >= 12 else None,
            original_same_subset=fit([np.median([np.asarray(frames[i]['detection']['pupil_ellipse']['center'])/2
                                               for i in window], axis=0) for window in kept]) if min(counts) >= 12 else None,
            fixation_p90_sensor_px=[float(np.percentile(np.linalg.norm(
                np.asarray([np.asarray(frames[i]['detection']['pupil_ellipse']['center'])/2-shifts[i]
                            for i in window])-median, axis=1), 90)) if window else None for window, median in zip(kept, medians)],
            correlation_percentiles=np.percentile(scores, [10, 50, 90]).tolist() if scores else None)
    # One runnable check: the natural mask excludes the pupil and saturated pixels;
    # LK must recover a known small image translation if features are available.
    center = np.rint(np.asarray(frames[reference_index]['detection']['pupil_ellipse']['center'])/2).astype(int)
    assert mask[center[1], center[0]] == 0 and not mask[reference > 240].any()
    moved = cv2.warpAffine(enlarged[reference_index], np.float32([[1, 0, 6], [0, 1, -6]]),
                          (640, 480), borderMode=cv2.BORDER_REFLECT)
    estimate = tracked_translation(enlarged[reference_index], moved, enlarged_mask, minimum=4)
    assert estimate is not None and np.linalg.norm(estimate-[6, -6]) < 1, estimate
    report = dict(source=str(source), experiments=experiments, known_shift_error_sensor_px=float(np.linalg.norm(estimate-[6, -6])/2),
        limitations='Single wearer with glasses. Anatomical/eyewear segmentation is not implemented. Natural-surface motion has no ground truth. Training fit only, no independent 4-point validation. Incremental LK has no drift correction. Recorded pupils include flow-only estimates.')
    (output/'flow-results.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
