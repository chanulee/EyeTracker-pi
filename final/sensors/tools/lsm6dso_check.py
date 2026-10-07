#!/usr/bin/env python3
"""Standalone LSM6DSO check. Linux Python stdlib only; restores sensor settings.

Keep the sensor still for --duration seconds. Stop other IMU readers first.
python3 final/sensors/tools/lsm6dso_check.py --duration 10
"""
import argparse
import ctypes
import fcntl
import math
import os
import struct
import sys
import time


class Message(ctypes.Structure):
    _fields_ = [("addr", ctypes.c_uint16), ("flags", ctypes.c_uint16),
                ("length", ctypes.c_uint16), ("buf", ctypes.c_void_p)]


class Transfer(ctypes.Structure):
    _fields_ = [("msgs", ctypes.POINTER(Message)), ("nmsgs", ctypes.c_uint32)]


def read(fd, address, register, length=1):
    reg = ctypes.create_string_buffer(bytes([register]))
    buf = ctypes.create_string_buffer(length)
    msgs = (Message * 2)(Message(address, 0, 1, ctypes.addressof(reg)),
                         Message(address, 1, length, ctypes.addressof(buf)))
    fcntl.ioctl(fd, 0x0707, Transfer(msgs, 2))  # I2C_RDWR, repeated start
    return buf.raw


def write(fd, address, register, value):
    buf = ctypes.create_string_buffer(bytes([register, value]))
    msgs = (Message * 1)(Message(address, 0, 2, ctypes.addressof(buf)))
    fcntl.ioctl(fd, 0x0707, Transfer(msgs, 1))


def decode(data):
    gx, gy, gz, ax, ay, az = struct.unpack("<6h", data)
    return tuple(v * 0.000061 for v in (ax, ay, az)), tuple(v * 0.00875 for v in (gx, gy, gz))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--bus", type=int, default=1)
    ap.add_argument("--duration", type=float, default=10)
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        a, g = decode(struct.pack("<6h", 1000, -1000, 0, 0, 0, 16384))
        assert a == (0.0, 0.0, 16384 * 0.000061)
        assert g == (8.75, -8.75, 0.0)
        assert ctypes.sizeof(Message) == (16 if ctypes.sizeof(ctypes.c_void_p) == 8 else 12)
        print("PASS: signed decoding, units and Linux I2C message layout")
        return 0
    if not math.isfinite(args.duration) or args.duration <= 0:
        ap.error("--duration must be finite and positive")
    fd = os.open(f"/dev/i2c-{args.bus}", os.O_RDWR)
    try:
        address = None
        for candidate in (0x6A, 0x6B):
            try:
                identity = read(fd, candidate, 0x0F)[0]
                print(f"Address 0x{candidate:02X}: WHO_AM_I=0x{identity:02X}", flush=True)
                if identity == 0x6C:
                    address = candidate
                    break
            except OSError as exc:
                print(f"Address 0x{candidate:02X}: {exc}", flush=True)
        if address is None:
            print("FAIL: no compatible LSM6DSO identity at 0x6A/0x6B")
            return 1
        saved = {reg: read(fd, address, reg)[0] for reg in (0x10, 0x11, 0x12)}
        try:
            write(fd, address, 0x12, (saved[0x12] & ~0x03) | 0x44)  # BDU, auto increment
            write(fd, address, 0x10, 0x40)  # 104 Hz, +/-2 g
            write(fd, address, 0x11, 0x40)  # 104 Hz, +/-250 deg/s
            time.sleep(0.2)
            print("Keep still. accel=(g), gyro=(deg/s); gravity should be about 1 g.", flush=True)
            end = time.monotonic() + args.duration
            norms, packets = [], set()
            while time.monotonic() < end:
                deadline = min(end, time.monotonic() + 1)
                while read(fd, address, 0x1E)[0] & 3 != 3:
                    if time.monotonic() >= deadline:
                        raise RuntimeError("No fresh accelerometer/gyroscope data within 1 second")
                    time.sleep(0.005)
                data = read(fd, address, 0x22, 12)
                accel, gyro = decode(data)
                norm = math.sqrt(sum(v*v for v in accel))
                norms.append(norm)
                packets.add(data)
                print(f"accel=({accel[0]:+.4f}, {accel[1]:+.4f}, {accel[2]:+.4f}) "
                      f"|a|={norm:.4f}  gyro=({gyro[0]:+.3f}, {gyro[1]:+.3f}, {gyro[2]:+.3f})", flush=True)
                time.sleep(0.2)
            mean = sum(norms) / len(norms)
            ok = len(norms) >= 3 and len(packets) > 1 and 0.8 <= mean <= 1.2
            print(f"{'PASS' if ok else 'FAIL'}: samples={len(norms)}, distinct={len(packets)}, "
                  f"mean gravity={mean:.4f} g (stationary check)")
            print("Rotation response and gyro calibration require a separate movement check.")
            return 0 if ok else 1
        finally:
            for reg, value in saved.items():
                write(fd, address, reg, value)
            print("Sensor settings restored.", flush=True)
    finally:
        os.close(fd)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, RuntimeError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        sys.exit(1)
