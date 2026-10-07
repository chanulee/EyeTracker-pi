"""Run without hardware: python3 final/sensors/tools/test_live_imu.py."""
import math
import array
import itertools
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import lsm6dso_live as live


class LiveIMUTest(unittest.TestCase):
    def test_pullups_verified_and_privileged_fallback_is_noninteractive(self):
        low = SimpleNamespace(stdout='23: ip pd | lo\n24: ip pd | lo', returncode=0)
        high = SimpleNamespace(stdout='23: ip pu | hi\n24: ip pu | hi', returncode=0)
        denied = SimpleNamespace(returncode=1)
        with patch.object(live.subprocess, 'run', side_effect=[low, denied, high]) as run:
            live.ensure_imu_pullups()
        self.assertEqual(run.call_args_list[2].args[0],
                         ['sudo', '-n', 'pinctrl', 'set', '23,24', 'pu'])
        with patch.object(live.subprocess, 'run', return_value=high) as run:
            live.ensure_imu_pullups()
        self.assertEqual(run.call_count, 1)

    def test_zero2_unreadable_pull_state_does_not_block_connection(self):
        unknown = SimpleNamespace(stdout='23: ip -- | hi\n24: ip -- | hi', returncode=0)
        with patch.object(live.subprocess, 'run', return_value=unknown) as run:
            live.ensure_imu_pullups()
        self.assertEqual(run.call_count, 2)
        self.assertEqual(run.call_args.args[0], ['pinctrl', 'set', '23,24', 'pu'])

    def test_pullup_failure_stops_before_bus_access(self):
        with patch.object(live.subprocess, 'run', side_effect=FileNotFoundError):
            with self.assertRaisesRegex(RuntimeError, 'sudo pinctrl'):
                live.connect_sensor()

    def test_corrupt_rotation_is_rejected_instead_of_normalized(self):
        with self.assertRaisesRegex(ValueError, 'norm'):
            live.normalize_quaternion((-1.66, -1.89, 1.75, -1.09))

    def test_camera_open_diagnostics_distinguish_permission_and_owner(self):
        cv = SimpleNamespace(__version__='4.test', getBuildInformation=lambda: 'v4l/v4l2: YES')
        with patch.dict(sys.modules, {'cv2': cv}), \
                patch.object(live.os, 'open', side_effect=PermissionError('denied')), \
                patch.object(live.subprocess, 'run', return_value=SimpleNamespace(stdout=' 1234')):
            message = live.camera_open_error('/dev/video0')
        self.assertIn('denied', message)
        self.assertIn('1234', message)
        self.assertIn('v4l/v4l2: YES', message)

    def test_camera_resolved_index_backend_fallback_and_first_frame_wait(self):
        stop, bad, good, cv, discovery = live.threading.Event(), Mock(), Mock(), Mock(), Mock()
        stop.wait = Mock()
        bad.isOpened.return_value = False
        good.isOpened.return_value = True
        good.read.side_effect = [(False, None), (True, SimpleNamespace(shape=(240, 320, 3))), (False, None)]
        cv.VideoCapture.side_effect = [bad, good]
        cv.imencode.return_value = True, SimpleNamespace(tobytes=lambda: b'jpeg')
        discovery.select_camera.return_value = dict(path='/dev/v4l/by-id/eye-video-index0',
                                                    node='/dev/video7', name='Eye', identity='usb-eye')
        states = []
        def publish(state):
            states.append(state)
            if not state['ready'] and not state.get('stage'):
                stop.set()
        with patch.dict(sys.modules, {'cv2': cv, 'camera_device': discovery}):
            live.camera_loop(stop, publish, Mock())
        self.assertEqual([call.args for call in cv.VideoCapture.call_args_list],
                         [(7, cv.CAP_V4L2), (7, cv.CAP_ANY)])
        bad.release.assert_called_once()
        good.release.assert_called_once()
        self.assertEqual(good.set.call_args_list[0].args, (cv.CAP_PROP_FRAME_WIDTH, 320))
        self.assertEqual(good.set.call_args_list[1].args, (cv.CAP_PROP_FRAME_HEIGHT, 240))
        self.assertEqual(good.set.call_count, 2)
        self.assertEqual(states[1]['backend'], 'AUTO')
        self.assertEqual(states[1]['width'], 320)
        stop.wait.assert_any_call(.1)

    def test_camera_capture_shared_and_released_after_disconnect(self):
        stop = live.threading.Event()
        frame = SimpleNamespace(shape=(480, 640, 3))
        capture = Mock()
        capture.isOpened.return_value = True
        capture.read.side_effect = [(True, frame), (False, None)]
        cv = Mock()
        cv.VideoCapture.return_value = capture
        cv.imencode.return_value = True, SimpleNamespace(tobytes=lambda: b'jpeg')
        discovery = Mock()
        discovery.select_camera.return_value = dict(path='/dev/video2', name='Eye camera', identity='usb-eye')
        states, video = [], Mock()
        def publish(state):
            states.append(state)
            if not state['ready'] and not state.get('stage'):
                stop.set()
        with patch.dict(sys.modules, {'cv2': cv, 'camera_device': discovery}):
            live.camera_loop(stop, publish, video)
        discovery.select_camera.assert_called_once_with({'camera_mode': 'auto', 'camera': -1}, None)
        cv.VideoCapture.assert_called_once_with(2, cv.CAP_V4L2)
        video.publish.assert_called_once_with(b'jpeg')
        self.assertEqual(states[0]['stage'], 'starting')
        self.assertTrue(states[1]['ready'])
        self.assertEqual(states[1]['name'], 'Eye camera')
        self.assertFalse(states[-1]['ready'])
        capture.release.assert_called_once()

    def test_camera_reconnect_keeps_usb_identity(self):
        stop, capture, cv, discovery = live.threading.Event(), Mock(), Mock(), Mock()
        stop.wait = Mock()
        errors = []
        def publish(state):
            if state.get('stage'):
                return
            errors.append(state)
            if len(errors) == 2:
                stop.set()
        capture.isOpened.return_value = True
        capture.read.return_value = False, None
        cv.VideoCapture.return_value = capture
        discovery.select_camera.return_value = dict(path='/dev/video2', name='Eye', identity='usb-eye')
        with patch.dict(sys.modules, {'cv2': cv, 'camera_device': discovery}), \
                patch.object(live.time, 'monotonic', side_effect=itertools.count(0, 2)):
            live.camera_loop(stop, publish, Mock())
        self.assertEqual([call.args[1] for call in discovery.select_camera.call_args_list],
                         [None, 'usb-eye'])
        self.assertEqual(capture.release.call_count, 2)
        # Like camera_accuracy: request small geometry, then retry device defaults.
        cv.VideoWriter_fourcc.assert_not_called()
        self.assertEqual(capture.set.call_count, 2)

    def test_microphone_channel_dc_and_levels(self):
        stereo = array.array('i')
        for i in range(4800):
            stereo.extend((int(-.056*2**31 + .1*2**31*math.sin(2*math.pi*1000*i/48000)), 0))
        if sys.byteorder != 'little':
            stereo.byteswap()
        pcm = live.microphone_pcm(stereo.tobytes(), 0)
        levels = live.microphone_levels(pcm)
        self.assertEqual(len(pcm), 3200)
        self.assertTrue(levels['signal'])
        self.assertAlmostEqual(levels['rms_db'], -23.06, delta=.2)
        self.assertEqual(len(levels['waveform']), 200)
        self.assertFalse(live.microphone_levels(live.microphone_pcm(stereo.tobytes(), 1))['signal'])
        self.assertLess(abs(sum(array.array('h', pcm))/1600), 1)

    def test_microphone_detection_and_bounded_listeners(self):
        with patch.object(live.subprocess, 'run', return_value=SimpleNamespace(
                stdout='card 3: i2smic [i2smic], device 0: bcm2835-i2s-dir-hifi\n')):
            self.assertEqual(live.microphone_device(), 'hw:3,0')
        bus = live.AudioBus()
        a, b = bus.subscribe(), bus.subscribe()
        for i in range(10):
            bus.publish(bytes([i]))
        self.assertEqual(a.qsize(), 4)
        self.assertEqual(a.get_nowait(), b'\x06')
        self.assertEqual(b.get_nowait(), b'\x06')
        bus.unsubscribe(a)
        self.assertNotIn(a, bus.clients)

    def connect(self, addresses, fail=False, reset_pin=None, mode='auto', i2c_bus=3):
        bus = Mock()
        bus.try_lock.return_value = True
        bus.scan.return_value = addresses
        lsm = Mock()
        lsm.is_connected.return_value = True
        lsm.begin.return_value = not fail
        bno = SimpleNamespace(acceleration=(0, 0, 9.80665), gyro=(0, math.pi, 0))
        driver = Mock(return_value=lsm)
        helper = Mock()
        helper.quiet_library.return_value = SimpleNamespace(
            BNO_REPORT_ACCELEROMETER=1, BNO_REPORT_GYROSCOPE=2,
            BNO_REPORT_ROTATION_VECTOR=5, BNO_REPORT_MAGNETOMETER=3,
            BNO_REPORT_GRAVITY=6, BNO_REPORT_LINEAR_ACCELERATION=4)
        helper.bring_up.return_value = bno, next((a for a in (0x4B, 0x4A) if a in addresses), None)
        extended = Mock(return_value=bus)
        factory = Mock(return_value=('bus', i2c_bus))
        modules = {'board': SimpleNamespace(SCL=3, SDA=2),
                   'adafruit_extended_bus': SimpleNamespace(ExtendedI2C=extended),
                   'qwiic_i2c': SimpleNamespace(get_i2c_driver=factory),
                   'qwiic_lsm6dso': SimpleNamespace(QwiicLSM6DSO=driver),
                   'imu_init': helper}
        with patch.dict(sys.modules, modules), patch.object(live, 'ensure_imu_pullups') as pullups:
            expected = any(a in addresses for a in ((0x4A, 0x4B) if mode == 'BNO086'
                           else (0x6A, 0x6B) if mode == 'LSM6DSO' else (0x4A, 0x4B, 0x6A, 0x6B)))
            if fail or not expected:
                with self.assertRaises(RuntimeError):
                    live.connect_sensor(mode=mode, i2c_bus=i2c_bus)
                result = None
            else:
                result = live.connect_sensor(reset_pin=reset_pin, mode=mode, i2c_bus=i2c_bus)
        extended.assert_called_once_with(i2c_bus)
        if i2c_bus == 3:
            pullups.assert_called_once_with()
        else:
            pullups.assert_not_called()
        if driver.called:
            factory.assert_called_once_with(iBus=i2c_bus)
        return result, bus, driver, helper

    def test_legacy_bus_does_not_touch_software_i2c_pins(self):
        result, bus, driver, helper = self.connect([0x6B], i2c_bus=1)
        self.assertEqual(result[0], 'LSM6DSO')
        driver.assert_called_once_with(address=0x6B, i2c_driver=('bus', 1))

    def test_explicit_imu_mode_does_not_initialize_wrong_chip(self):
        result, bus, driver, helper = self.connect([0x6B, 0x4B], mode='BNO086')
        self.assertEqual(result[0], 'BNO086')
        driver.assert_not_called()
        result, bus, driver, helper = self.connect([0x4B], mode='LSM6DSO')
        self.assertIsNone(result)
        driver.assert_not_called()
        helper.bring_up.assert_not_called()

    def test_optional_bno_hardware_reset_before_initialization(self):
        pin = Mock()
        with patch.object(live.time, 'sleep') as sleep:
            result, bus, driver, helper = self.connect([0x4B], reset_pin=pin)
        pin.switch_to_output.assert_called_once_with(value=False)
        self.assertTrue(pin.value)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [.02, .7])
        self.assertEqual(result[:2], ('BNO086', 0x4B))

    def test_lsm_addresses_and_priority(self):
        for address in (0x6A, 0x6B):
            result, bus, driver, helper = self.connect([address, 0x4B])
            self.assertEqual(result[:2], ('LSM6DSO', address))
            driver.assert_called_once_with(address=address, i2c_driver=('bus', 3))
            helper.bring_up.assert_not_called()
            bus.deinit.assert_called_once()

    def test_bno_addresses_and_units(self):
        for address in (0x4A, 0x4B):
            result, bus, driver, helper = self.connect([address])
            self.assertEqual(result[:2], ('BNO086', address))
            self.assertIs(result[3], bus)
            bus.deinit.assert_not_called()
            helper.bring_up.assert_called_once()
            self.assertEqual(helper.bring_up.call_args.kwargs['report_interval'], 100_000)
            accel, gyro = live.read_sensor(result[0], result[2])
            self.assertEqual(accel, (0, 0, 1))
            self.assertEqual(gyro, (0, 180, 0))
            self.assertEqual(live.tilt(accel), (0, 0))

    def test_no_sensor_and_failed_init_release_bus(self):
        for addresses, fail in (([], False), ([0x6B], True)):
            _, bus, _, _ = self.connect(addresses, fail)
            bus.unlock.assert_called_once()
            bus.deinit.assert_called_once()

    def test_lsm_keeps_original_units(self):
        imu = Mock()
        imu.read_float_accel_gyro_all.return_value = (0, 1, 0, 10, 20, 30)
        self.assertEqual(live.read_sensor('LSM6DSO', imu), ((0, 1, 0), (10, 20, 30)))
        self.assertAlmostEqual(live.tilt((0, 1, 0))[0], math.pi / 2)

    def test_bno_full_pose_and_vectors(self):
        imu = SimpleNamespace(acceleration=(0, 0, 9.80665), gyro=(0, 0, math.pi),
                              quaternion=(0, 0, math.sqrt(.5), math.sqrt(.5)),
                              magnetic=(18, 5, -30), gravity=(0, 0, 9.8),
                              linear_acceleration=(.1, .2, .3))
        data = live.measurement('BNO086', imu)
        self.assertAlmostEqual(data['yaw'], math.pi / 2)
        self.assertAlmostEqual(data['roll'], 0)
        self.assertEqual(data['gyro'], (0, 0, 180))
        self.assertEqual(data['mag'], (18, 5, -30))
        self.assertEqual(data['linear_accel'], (.1, .2, .3))
        self.assertEqual(data['gravity_vector'], (0, 0, 9.8))
        self.assertIsNone(data['temperature_c'])
        imu.quaternion = (0, 0, 0, 0)
        with self.assertRaises(ValueError):
            live.measurement('BNO086', imu)

    def test_lsm_does_not_invent_yaw_or_magnetometer(self):
        imu = SimpleNamespace(read_float_accel_gyro_all=lambda: (0, 0, 1, 0, 0, 100),
                              read_temp_c=lambda: 23.5)
        data = live.measurement('LSM6DSO', imu)
        self.assertIsNone(data['yaw'])
        self.assertIsNone(data['quaternion'])
        self.assertIsNone(data['mag'])
        self.assertIsNone(data['gravity_vector'])
        self.assertEqual(data['temperature_c'], 23.5)
        self.assertEqual(data['gyro'][2], 100)

    def test_transient_error_is_stale_then_recovers_without_reset(self):
        self.check_recovery(1)

    def test_sustained_error_reconnects_and_resets_session(self):
        self.check_recovery(20)

    def check_recovery(self, error_count):
        class Stop:
            steps = 0
            def is_set(self):
                self.steps += 1
                return self.steps > error_count + 2
            def wait(self, seconds):
                pass
        states = []
        bus = Mock()
        measurement = dict(roll=0, pitch=0, yaw=0, quaternion=(0, 0, 0, 1))
        with patch.object(live, 'connect_sensor', return_value=('BNO086', 0x4B, object(), bus)) as connect, \
             patch.object(live, 'measurement', side_effect=[measurement] + [KeyError(255)]*error_count + [measurement]):
            live.sample_loop(Stop(), states.append)
        stale = [s for s in states if s.get('last_error')]
        self.assertTrue(stale)
        self.assertEqual(stale[0]['last_error'], 'KeyError: 255')
        self.assertTrue(stale[0]['stale'])
        self.assertEqual(stale[0]['quaternion'], (0, 0, 0, 1))
        self.assertFalse(states[-1]['stale'])
        self.assertEqual(states[-1]['errors'], error_count)
        self.assertEqual(connect.call_count, 2 if error_count == 20 else 1)
        self.assertEqual(states[-1]['generation'], connect.call_count)


if __name__ == '__main__':
    unittest.main()
