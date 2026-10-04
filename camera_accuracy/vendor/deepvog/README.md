Unmodified `deepvog/model/DeepVOG_model.py` from https://github.com/pydsgz/DeepVOG
at commit `2b8644c23e4472697c2a9949033b78af1f79e34e` (GPL-3.0; see LICENSE).

The adapter in `camera_accuracy/research.py` runs the original network with
Keras 3's PyTorch backend and the official HDF5 weights. It reuses our existing
ellipse quality checks; DeepVOG's offline 3D eye model is not used.
Weights are downloaded into the ignored `camera_accuracy/models/` directory.
