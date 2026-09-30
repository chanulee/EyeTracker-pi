#!/bin/bash
# Optional Mac-only Pupil Labs experiment; Pi never installs this environment.
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_dir"
if [ "$(uname -s)" != Darwin ]; then echo 'Mac에서 실행하세요.' >&2; exit 1; fi
xcrun --find clang >/dev/null
if [ ! -x .venv-pupil/bin/python ]; then
  if [ -x .venv/bin/python ]; then .venv/bin/python -m venv .venv-pupil; else python3 -m venv .venv-pupil; fi
fi
export PATH="$repo_dir/.venv-pupil/bin:$PATH"
export MACOSX_DEPLOYMENT_TARGET=13.0
export CMAKE_PREFIX_PATH="$repo_dir/.venv-pupil/native"
export CMAKE_ARGS='-DCMAKE_MODULE_LINKER_FLAGS=-Wl,-undefined,dynamic_lookup -DCMAKE_OSX_DEPLOYMENT_TARGET=13.0'
python -m pip install 'numpy>=1.26,<2' 'opencv-python>=4.10,<4.12' 'aiohttp>=3.12,<4' \
  'cython>=0.29.37,<3' 'cmake>=3.20,<4' scikit-build wheel setuptools setuptools_scm ninja msgpack sortedcontainers
if [ ! -f "$CMAKE_PREFIX_PATH/share/eigen3/cmake/Eigen3Config.cmake" ]; then
  build_dir="$(mktemp -d "${TMPDIR:-/tmp}/eye-pupil-build.XXXXXX")"
  trap 'rm -rf "$build_dir"' EXIT
  curl -fL https://gitlab.com/libeigen/eigen/-/archive/3.4.0/eigen-3.4.0.tar.gz -o "$build_dir/eigen.tar.gz"
  tar -xzf "$build_dir/eigen.tar.gz" -C "$build_dir"
  cmake -S "$build_dir/eigen-3.4.0" -B "$build_dir/build" \
    -DCMAKE_INSTALL_PREFIX="$CMAKE_PREFIX_PATH" -DBUILD_TESTING=OFF -DCMAKE_EXPORT_NO_PACKAGE_REGISTRY=ON
  cmake --install "$build_dir/build"
fi
python -m pip install --no-deps --no-build-isolation \
  'pye3d @ git+https://github.com/pupil-labs/pye3d-detector.git@eb50e384ce131e2a27e0de058c25fa16254c63ed'
python -c 'from pye3d.detector_3d import Detector3D; from pye3d.camera import CameraModel; Detector3D(CameraModel(560., (640,480))); print("Pupil Labs 3D 준비 완료")'
