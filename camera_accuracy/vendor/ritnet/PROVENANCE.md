# RITnet upstream files

Source: https://bitbucket.org/eye-ush/ritnet/
Commit: `857249c55baceae897eabb4d83b192c721bc4c71`

`densenet.py`, `best_model.pkl`, and `License.md` are unmodified upstream files.
Weights SHA256: `02de259b8fe2e26e825101bb5d3f54b48a13a1a264eb0631c367db4596d0defa`.
MIT license is retained beside the files.

The adapter uses PyTorch `weights_only=True`, CPU inference at 320×240,
the published gamma 0.8 / CLAHE 1.5 / normalization (0.5, 0.5), and
OpenEDS class IDs 0 background, 1 sclera, 2 iris, 3 pupil.
320×240 is a bench speed tradeoff, not the original OpenEDS evaluation size.
Segmentation describes visible tissue; completion of an occluded pupil is
a separate experimental ellipse fit, not a pretrained amodal prediction.
