#!/bin/bash
# Local Mac research environment. Existing exhibition dependencies stay separate.
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_dir"
if [ "$(uname -s)" != Darwin ]; then echo '현재 설치 스크립트는 macOS ARM64용입니다.' >&2; exit 1; fi
python_bin="${EYE_SETUP_PYTHON:-/opt/homebrew/bin/python3.10}"
"$python_bin" -c 'import platform,sys; assert sys.version_info[:2] == (3,10) and platform.machine() == "arm64", "Python 3.10 ARM64 필요"'
if [ ! -x camera_accuracy/.venv/bin/python ]; then "$python_bin" -m venv camera_accuracy/.venv; fi
export PATH="$repo_dir/camera_accuracy/.venv/bin:$PATH"
export CMAKE_PREFIX_PATH="$repo_dir/camera_accuracy/.venv/native"
export MACOSX_DEPLOYMENT_TARGET=13.0
python -m pip install 'numpy==1.26.4' 'opencv-python==4.11.0.86' 'aiohttp>=3.12,<4' \
  'cython>=0.29.37,<3' 'cmake>=3.24,<4' scikit-build wheel setuptools setuptools-scm ninja cysignals msgpack sortedcontainers
build_dir="$(mktemp -d "${TMPDIR:-/tmp}/eye-detector-build.XXXXXX")"
trap 'rm -rf "$build_dir"' EXIT
if [ ! -f "$CMAKE_PREFIX_PATH/share/eigen3/cmake/Eigen3Config.cmake" ]; then
  curl -fL https://gitlab.com/libeigen/eigen/-/archive/3.4.0/eigen-3.4.0.tar.gz -o "$build_dir/eigen.tar.gz"
  tar -xzf "$build_dir/eigen.tar.gz" -C "$build_dir"
  cmake -S "$build_dir/eigen-3.4.0" -B "$build_dir/eigen-build" -DCMAKE_INSTALL_PREFIX="$CMAKE_PREFIX_PATH" -DBUILD_TESTING=OFF -DCMAKE_EXPORT_NO_PACKAGE_REGISTRY=ON
  cmake --install "$build_dir/eigen-build"
fi
if [ ! -f "$CMAKE_PREFIX_PATH/lib/cmake/opencv4/OpenCVConfig.cmake" ]; then
  curl -fL https://github.com/opencv/opencv/archive/refs/tags/4.11.0.tar.gz -o "$build_dir/opencv.tar.gz"
  tar -xzf "$build_dir/opencv.tar.gz" -C "$build_dir"
  cmake -S "$build_dir/opencv-4.11.0" -B "$build_dir/opencv-build" -G Ninja -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX="$CMAKE_PREFIX_PATH" -DBUILD_LIST=core,imgproc -DBUILD_TESTS=OFF -DBUILD_PERF_TESTS=OFF \
    -DBUILD_EXAMPLES=OFF -DBUILD_opencv_apps=OFF -DBUILD_opencv_python3=OFF -DBUILD_opencv_python2=OFF -DBUILD_JAVA=OFF \
    -DWITH_IPP=OFF -DWITH_ITT=OFF -DWITH_OPENCL=OFF -DCMAKE_INSTALL_RPATH="$CMAKE_PREFIX_PATH/lib"
  cmake --build "$build_dir/opencv-build" --parallel 6
  cmake --install "$build_dir/opencv-build"
fi
export CMAKE_ARGS="-DCMAKE_MODULE_LINKER_FLAGS=-Wl,-undefined,dynamic_lookup -DCMAKE_INSTALL_RPATH=$CMAKE_PREFIX_PATH/lib -DCMAKE_OSX_DEPLOYMENT_TARGET=13.0"
python -m pip install --no-build-isolation 'pupil-detectors==2.0.2' 'pye3d==0.3.2'
if [ ! -f /opt/homebrew/opt/libxcb/lib/libxcb-shm.0.dylib ]; then brew install libxcb; fi
python -m pip install --no-deps 'https://github.com/openPupil/PyPupilEXT/releases/download/v0.0.1-beta/PyPupilEXT-0.0.1-cp310-cp310-macosx_14_0_universal2.whl#sha256=d8375fbe4822bbff741e3fd5794aebc37ba917823a54610f40ff29cd01d16919'
python -c 'from camera_accuracy.detectors import OpenSourceTracker; [OpenSourceTracker(x) for x in ("pupil-2d", "pupil-3d", "pure", "pure-3d", "else")]; print("검출기 설치 확인 완료")'
