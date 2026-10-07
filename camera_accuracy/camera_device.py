"""Match macOS camera identities to OpenCV's AVFoundation ordering."""
import json
import subprocess


def discover_cameras():
    # OpenCV sorts AVFoundation devices by uniqueID, not the system UI order.
    result = subprocess.run(['/usr/sbin/system_profiler', 'SPCameraDataType', '-json'],
                            capture_output=True, text=True, timeout=15, check=True)
    devices = json.loads(result.stdout).get('SPCameraDataType', [])
    devices = sorted(devices, key=lambda item: item.get('spcamera_unique-id', ''))
    return [dict(index=index, identity=item['spcamera_unique-id'], name=item.get('_name', 'USB 카메라'),
                 model=item.get('spcamera_model-id', ''),
                 usb=item.get('spcamera_model-id', '').startswith('UVC Camera VendorID_'))
            for index, item in enumerate(devices)]


def discover_usb_cameras():
    return [device for device in discover_cameras() if device['usb']]


def select_camera(identity):
    device = next((device for device in discover_cameras() if device['identity'] == identity), None)
    if device is None:
        raise ValueError('선택한 카메라가 없습니다. 장치 목록을 새로고침하세요')
    return device


def recover_camera(previous):
    devices = discover_cameras()
    exact = next((device for device in devices if device['identity'] == previous['identity']), None)
    if exact:
        return exact
    # USB port changes can change uniqueID. Only reconnect an unambiguous matching model.
    matches = [device for device in devices if device['usb'] and previous.get('usb', previous['model'].startswith('UVC Camera VendorID_'))
               and device['model'] == previous['model']]
    if len(matches) == 1:
        return matches[0]
    raise RuntimeError('사용하던 카메라 재연결 대기 · 같은 모델이 여러 대이면 목록에서 선택하세요' if matches
                       else 'USB 카메라 연결 대기 · 연결되면 자동으로 다시 시도합니다')


def select_usb_camera(identity=None, preferred_index=0):
    devices = discover_usb_cameras()
    if identity:
        device = next((item for item in devices if item['identity'] == identity), None)
        if device:
            return device
        raise RuntimeError('사용하던 USB 카메라가 없습니다. 연결 후 카메라 연결 새로고침을 누르세요')
    if len(devices) == 1:
        return devices[0]
    device = next((item for item in devices if item['index'] == preferred_index), None)
    if device:
        return device
    raise RuntimeError('USB 카메라를 찾지 못했습니다' if not devices else 'USB 카메라가 여러 대입니다. --camera 번호를 지정하세요')
