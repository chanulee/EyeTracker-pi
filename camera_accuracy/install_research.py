"""Run with camera_accuracy/.venv/bin/python -m camera_accuracy.install_research."""
import hashlib
import subprocess
import sys
import urllib.request

from .research import HERE, MODELS


def main():
    subprocess.run([sys.executable, '-m', 'pip', 'install', '-r', str(HERE/'requirements-research.txt')], check=True)
    # Only the official Torch path; upstream's default dependencies also install JAX/training tools.
    subprocess.run([sys.executable, '-m', 'pip', 'install', '--no-deps',
        'https://github.com/google-deepmind/tapnet/archive/730cda1c730877cfedbe01bf87fb1cadb78a565d.tar.gz'], check=True)
    (HERE/'models').mkdir(exist_ok=True)
    for name, (url, digest) in MODELS.items():
        path = HERE/'models'/name
        if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == digest:
            print(f'Verified {name}')
            continue
        temporary = path.with_suffix(path.suffix+'.part')
        try:
            urllib.request.urlretrieve(url, temporary)
            if hashlib.sha256(temporary.read_bytes()).hexdigest() != digest:
                raise ValueError(f'Official model checksum mismatch: {name}')
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)
    print('DeepVOG / online BootsTAPIR installed. Run: bash camera_accuracy/start.sh --engine orlosky-ecc')


if __name__ == '__main__':
    main()
