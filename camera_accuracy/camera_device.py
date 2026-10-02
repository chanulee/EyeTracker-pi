"""Match macOS camera identities to OpenCV's AVFoundation ordering."""
import json
import subprocess


def discover_usb_cameras():
    # OpenCV sorts AVFoundation devices by uniqueID, not the system UI order.
    result = subprocess.run(['/usr/sbin/system_profiler', 'SPCameraDataType', '-json'],
                            capture_output=True, text=True, timeout=15, check=True)
    devices = json.loads(result.stdout).get('SPCameraDataType', [])
    devices = sorted(devices, key=lambda item: item.get('spcamera_unique-id', ''))
    return [dict(index=index, identity=item['spcamera_unique-id'], name=item.get('_name', 'USB 카메라'),
                 model=item.get('spcamera_model-id', ''))
            for index, item in enumerate(devices)
            if item.get('spcamera_model-id', '').startswith('UVC Camera VendorID_')]


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
