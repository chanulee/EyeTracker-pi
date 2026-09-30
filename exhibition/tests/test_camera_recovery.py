import asyncio
import os
from pathlib import Path
import socket
import tempfile
import time
import unittest
from unittest.mock import patch

import cv2
import numpy as np

from exhibition.camera_device import discover_usb_cameras, select_camera, probe_device
from exhibition.pi import Camera, DEFAULTS, watchdog

DEVICE=dict(path='/dev/video0',node='/dev/video0',name='Eye camera',bus='usb-1',identity='usb-eye')


class DiscoveryCheck(unittest.TestCase):
    def test_enumeration_excludes_metadata_and_pi_codecs_and_uses_stable_alias(self):
        with tempfile.TemporaryDirectory() as directory:
            dev=Path(directory)
            for number in (0,1,10): (dev/f'video{number}').touch()
            ids=dev/'v4l'/'by-id'; ids.mkdir(parents=True)
            (ids/'usb-eye-video-index0').symlink_to('../../video0')
            def probe(path):
                return dict(driver='bcm2835-codec' if path.name=='video10' else 'uvcvideo',
                            capture=path.name!='video1',name='Eye',bus='usb-1')
            with patch('exhibition.camera_device.probe_device',side_effect=probe):
                found=discover_usb_cameras(dev)
            self.assertEqual(len(found),1)
            self.assertEqual(found[0]['path'],str(ids/'usb-eye-video-index0'))
            self.assertEqual(found[0]['node'],str(dev/'video0'))

    def test_auto_recovers_renumbered_device_and_does_not_switch_to_other_camera(self):
        renamed=dict(DEVICE,path='/dev/video2',node='/dev/video2')
        with patch('exhibition.camera_device.discover_usb_cameras',return_value=[renamed]):
            self.assertEqual(select_camera(DEFAULTS)['node'],'/dev/video2')
            self.assertEqual(select_camera(DEFAULTS,'usb-eye')['node'],'/dev/video2')
            with self.assertRaisesRegex(RuntimeError,'사용 중이던'):
                select_camera(DEFAULTS,'another-camera')
        with patch('exhibition.camera_device.discover_usb_cameras',return_value=[]):
            with self.assertRaisesRegex(RuntimeError,'USB'):
                select_camera(DEFAULTS)
        self.assertEqual(select_camera(dict(DEFAULTS,camera_mode='manual',camera=3))['path'],'/dev/video3')

    @unittest.skipUnless(os.name=='posix','Unix ioctl available')
    def test_querycap_uses_device_caps_to_reject_metadata(self):
        import struct
        try: import fcntl
        except ImportError: self.skipTest('fcntl unavailable')
        def ioctl(fd,command,data,mutate):
            self.assertEqual(command,0x80685600)
            data[:]=struct.pack('=16s32s32sIII3I',b'uvcvideo',b'Eye',b'usb-1',1,0x80000001,0x00800000,0,0,0)
        with tempfile.NamedTemporaryFile() as device, patch.object(fcntl,'ioctl',side_effect=ioctl):
            info=probe_device(device.name)
        self.assertFalse(info['capture'])
        self.assertEqual(info['driver'],'uvcvideo')


class RecoveryCheck(unittest.TestCase):
    def test_fps_changes_without_reopening_or_reconfiguring_usb_camera(self):
        camera=Camera(dict(DEFAULTS,transport='decoded',fps=15))
        reads=[]; settings=[]
        class Capture:
            def set(self,key,value): settings.append((key,value)); return True
            def get(self,key): return 30.
            def isOpened(self): return True
            def release(self): pass
            def read(self):
                reads.append(1)
                if len(reads)==2: camera.config=dict(camera.config,fps=30)
                if len(reads)==3: camera.stop.set()
                return True,np.full((240,320,3),127,np.uint8)
        with patch('exhibition.pi.select_camera',return_value=DEVICE), \
             patch('exhibition.pi.cv2.VideoCapture',return_value=Capture()) as opens, \
             patch('exhibition.pi.FrameRateGate.accept',return_value=True):
            camera.run()
        opens.assert_called_once()
        self.assertEqual([call for call in settings if call[0]==cv2.CAP_PROP_FPS],[(cv2.CAP_PROP_FPS,30)])
        self.assertEqual(camera.sequence,3)
        self.assertEqual(camera.diagnostics()['requested_fps'],30)

    def test_usb_outage_releases_first_reenumerates_and_restores_mjpeg(self):
        camera=Camera(dict(DEFAULTS))
        _,encoded=cv2.imencode('.jpg',np.full((240,320,3),127,np.uint8))
        released=[]; calls=[]
        class Capture:
            def __init__(self,number): self.number=number; self.reads=0
            def set(self,key,value): calls.append((self.number,key,value)); return True
            def get(self,key): return 30.
            def isOpened(self): return True
            def release(self): released.append(self.number)
            def read(self):
                self.reads+=1
                if self.number==0 and self.reads==2: return False,None
                if self.number==1: camera.stop.set()
                return True,encoded.reshape(1,-1)
        def wait(seconds):
            self.assertIn(0,released,'the driver must be released before retry sleep')
            return False
        renamed=dict(DEVICE,path='/dev/video2',node='/dev/video2')
        with patch('exhibition.pi.select_camera',side_effect=[DEVICE,renamed]) as selector, \
             patch('exhibition.pi.cv2.VideoCapture',side_effect=[Capture(0),Capture(1)]) as opens, \
             patch.object(camera.stop,'wait',side_effect=wait):
            camera.run()
        self.assertEqual([call.args[0] for call in opens.call_args_list],['/dev/video0','/dev/video2'])
        self.assertEqual(selector.call_args_list[1].args[1],'usb-eye')
        self.assertEqual(released,[0,1])
        self.assertEqual(camera.sequence,2)
        self.assertEqual(camera.diagnostics()['camera_recoveries'],1)
        self.assertEqual(camera.diagnostics()['transport_mode'],'camera-mjpeg')
        self.assertEqual(len([call for call in calls if call[1]==cv2.CAP_PROP_FOURCC]),2)


class WatchdogCheck(unittest.IsolatedAsyncioTestCase):
    async def test_hung_capture_withholds_systemd_heartbeat(self):
        with tempfile.TemporaryDirectory() as directory:
            address=str(Path(directory)/'notify')
            with socket.socket(socket.AF_UNIX,socket.SOCK_DGRAM) as server:
                server.bind(address);server.setblocking(False)
                camera=Camera(DEFAULTS)
                with patch.dict(os.environ,NOTIFY_SOCKET=address),patch.object(camera.thread,'is_alive',return_value=True):
                    task=asyncio.create_task(watchdog(camera))
                    await asyncio.sleep(0)
                    self.assertEqual(server.recv(100),b'WATCHDOG=1')
                    task.cancel()
                    with self.assertRaises(asyncio.CancelledError): await task
                    camera.progress=time.monotonic()-20
                    task=asyncio.create_task(watchdog(camera))
                    await asyncio.sleep(0)
                    with self.assertRaises(BlockingIOError): server.recv(100)
                    task.cancel()
                    with self.assertRaises(asyncio.CancelledError): await task
