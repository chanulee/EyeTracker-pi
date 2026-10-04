"""Run: .venv/bin/python -m unittest camera_accuracy.test_verified -v (no DeepVOG weights needed)."""
import unittest

import cv2
import numpy as np

from .verified import DelayedHampel, VerifiedTracker, ellipse_support, pupil_from_probability

PUPIL = dict(center=[320., 240.], axes=[70., 66.], angle_degrees=0., confidence=.9)
IRIS = dict(center=[322., 236.], axes=[200., 196.], angle_degrees=0., confidence=.9)


def eye_image():
    image = np.full((480, 640, 3), 170, np.uint8)
    cv2.circle(image, (320, 240), 100, (90, 90, 90), -1)
    cv2.circle(image, (320, 240), 34, (20, 20, 20), -1)
    return image


def pupil_probability():
    probability = np.zeros((240, 320), np.float32)
    cv2.circle(probability, (160, 120), 17, 1., -1)
    cv2.circle(probability, (165, 115), 3, 0., -1)  # glint hole
    return probability


class Proposer:
    def __init__(self, sequence):
        self.sequence, self.index, self.last = sequence, 0, None

    def reset_tracking_state(self):
        pass

    def process_frame(self, image):
        pupil = self.sequence[min(self.index, len(self.sequence) - 1)]
        self.index += 1
        self.last = dict(pupil_ellipse=pupil, confidence=pupil['confidence']) if pupil else {}

    def get_last_tracking_result(self):
        return self.last


class Segmenter:
    calls = 0

    def __call__(self, gray):
        self.calls += 1
        return pupil_probability()


class VerifiedChecks(unittest.TestCase):
    def test_probability_blob_fills_glint_and_scales_to_work_image(self):
        pupil = pupil_from_probability(pupil_probability())
        self.assertAlmostEqual(pupil['center'][0], 320, delta=2)
        self.assertAlmostEqual(max(pupil['axes']), 70, delta=5)
        self.assertGreater(pupil['confidence'], .8)
        self.assertIsNone(pupil_from_probability(np.zeros((240, 320), np.float32)))

    def test_deepvog_support_separates_pupil_from_iris(self):
        probability = pupil_probability()
        self.assertGreater(ellipse_support(probability, PUPIL), .8)
        self.assertLess(ellipse_support(probability, IRIS), .2)

    def test_hampel_delays_and_drops_spikes(self):
        hampel, out = DelayedHampel(delay=2), []
        centers = [[100, 100], [101, 100], [102, 101], [180, 100], [103, 101], [104, 100], [105, 100]]
        for frame, center in enumerate(centers):
            row = hampel.push(dict(frame=frame, pupil=dict(center=center, axes=[40, 40])))
            out.append(row)
        self.assertIsNone(out[0])
        self.assertIsNone(out[1])
        emitted = {row['frame']: row for row in out if row}
        self.assertIsNotNone(emitted[2]['pupil'])
        self.assertIsNone(emitted[3]['pupil'])
        self.assertEqual(emitted[3]['rejected'], 'center_spike')

    def test_iris_proposals_never_reach_calibration(self):
        sequence = [PUPIL] * 6 + [IRIS] * 4 + [PUPIL] * 10
        segmenter = Segmenter()
        tracker = VerifiedTracker(verify_every=3, delay=2, segmenter=segmenter, proposer=Proposer(sequence))
        published = []
        for _ in sequence:
            tracker.process_frame(eye_image())
            published.append(tracker.get_last_tracking_result())
        sizes = [max(row['pupil_ellipse']['axes']) for row in published if row['pupil_ellipse']]
        self.assertTrue(sizes)
        self.assertLess(max(sizes), 100)  # no iris-sized ellipse is ever published
        self.assertTrue(all(row['raw'] is not None for row in published if row['pupil_ellipse']))
        self.assertLess(segmenter.calls, len(sequence))  # DeepVOG not run on every frame
        delayed = [row['tracker_details'].get('source_frame') for row in published if row['tracker_details'].get('source_frame') is not None]
        self.assertEqual(delayed[0], 0)


if __name__ == '__main__':
    unittest.main()
