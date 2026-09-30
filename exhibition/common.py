"""Small shared configuration helpers for the Pi and Mac processes."""
import json
import math
import os
from pathlib import Path
from urllib.parse import urlsplit


def save_config(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    with open(temporary, 'w', opener=lambda name, flags: os.open(name, flags, 0o600)) as f:
        json.dump(data, f, indent=2, allow_nan=False)
        f.write('\n')
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def load_config(path, defaults):
    path = Path(path)
    result = dict(defaults)
    if path.exists():
        result.update(json.loads(path.read_text()))
    else:
        save_config(path, result)
    return result


def number(value, low, high, integer=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError('숫자를 입력하세요')
    if not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f'허용 범위: {low}–{high}')
    if integer and int(value) != value:
        raise ValueError('정수를 입력하세요')
    return int(value) if integer else float(value)


def receiver_url(value):
    if not isinstance(value, str):
        raise ValueError('주소는 문자열이어야 합니다')
    url = urlsplit(value)
    if (url.scheme not in ('ws', 'wss') or not url.hostname or url.username
            or url.password or url.query or url.fragment or url.path != '/camera'):
        raise ValueError('ws://맥주소:8080/camera 형식으로 입력하세요')
    _ = url.port  # Reject malformed ports.
    return value
