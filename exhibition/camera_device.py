"""Find UVC capture nodes without opening a video stream or guessing node numbers."""
import os
from pathlib import Path
import struct


def probe_device(path):
    import fcntl  # Linux only; called on the Pi, not on the Mac.
    descriptor = os.open(str(path), os.O_RDONLY | os.O_NONBLOCK)
    try:
        data = bytearray(104)  # struct v4l2_capability, Linux UAPI
        fcntl.ioctl(descriptor, 0x80685600, data, True)  # VIDIOC_QUERYCAP
    finally:
        os.close(descriptor)
    driver, name, bus, _, capabilities, device_caps, *_ = struct.unpack('=16s32s32sIII3I', data)
    caps = device_caps if capabilities & 0x80000000 else capabilities
    decode = lambda value: value.split(b'\0', 1)[0].decode('utf-8', errors='replace')
    return dict(driver=decode(driver), name=decode(name), bus=decode(bus), capture=bool(caps & 1))


def discover_usb_cameras(device_root=Path('/dev')):
    aliases = sorted((device_root / 'v4l' / 'by-id').glob('*')) + sorted((device_root / 'v4l' / 'by-path').glob('*'))
    found = []
    nodes = sorted((path for path in device_root.glob('video*') if path.name[5:].isdigit()),
                   key=lambda path: int(path.name[5:]))
    for path in nodes:
        try:
            info = probe_device(path)
            if info['driver'] != 'uvcvideo' or not info['capture']:
                continue  # Skip metadata nodes and the Pi's internal codec/ISP devices.
            alias = next((item for item in aliases if item.resolve() == path.resolve()), path)
            identity = str(alias) if alias != path else info['bus'] or str(path)
            found.append(dict(info, path=str(alias), node=str(path), identity=identity))
        except OSError:
            continue
    return found


def select_camera(config, identity=None):
    if config.get('camera_mode', 'auto') == 'manual':
        return dict(path=f"/dev/video{config['camera']}", node=f"/dev/video{config['camera']}",
                    identity=None, name='수동 선택', bus=None)
    devices = discover_usb_cameras()
    if identity:
        chosen = next((device for device in devices if device['identity'] == identity), None)
        if chosen:
            return chosen
        raise RuntimeError('사용 중이던 USB 카메라가 사라졌습니다. 같은 카메라를 다시 연결하세요 (자동 재검색 중)')
    if len(devices) == 1:
        return devices[0]
    preferred = next((device for device in devices if device['node'] == f"/dev/video{config['camera']}"), None)
    if preferred:
        return preferred
    if devices:
        raise RuntimeError('USB 카메라가 여러 대입니다. 수동 모드에서 카메라 번호를 지정하세요')
    raise RuntimeError('캡처 가능한 USB 카메라를 찾지 못했습니다. USB/OTG 연결을 확인하세요 (자동 재검색 중)')
