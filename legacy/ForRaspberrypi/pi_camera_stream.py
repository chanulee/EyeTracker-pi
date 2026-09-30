#!/usr/bin/env python3
"""
Low-latency camera streamer for the Raspberry Pi (MJPEG over HTTP).
No tracking happens here; the laptop runs the 3D tracker.

Run on the Pi:   python pi_camera_stream.py
Stream URL:      http://<pi-ip>:8000/stream.mjpg
"""
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2

# ---- settings: lower = less lag over Wi-Fi ----
PORT = 8000
CAMERA_INDEX = 0          # change if your camera is not /dev/video0
WIDTH, HEIGHT = 320, 240  # stream size (try 160, 120 if still laggy)
JPEG_QUALITY = 60         # 40-70 is a good range
GRAYSCALE = True          # eye tracking doesn't need color; makes frames smaller
MAX_FPS = 30
SEND_BUFFER = 32 * 1024   # small socket buffer so old frames can't pile up

cond = threading.Condition()
latest_jpeg = None
frame_id = 0


def camera_loop():
    global latest_jpeg, frame_id
    cap = cv2.VideoCapture(CAMERA_INDEX, cv2.CAP_V4L2)
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, WIDTH)     # ask the camera for the small size
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, HEIGHT)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    if not cap.isOpened():
        print("Error: could not open camera. Is another program using it?")
        return

    count, size_sum, t0, last_sent = 0, 0, time.time(), 0.0
    while True:
        ok, frame = cap.read()
        if not ok:
            time.sleep(0.05)
            continue
        now = time.time()
        if now - last_sent < 1.0 / MAX_FPS:
            continue
        last_sent = now

        if frame.shape[1] != WIDTH or frame.shape[0] != HEIGHT:
            frame = cv2.resize(frame, (WIDTH, HEIGHT), interpolation=cv2.INTER_AREA)
        if GRAYSCALE:
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
        if not ok:
            continue
        data = buf.tobytes()
        with cond:
            latest_jpeg = data
            frame_id += 1
            cond.notify_all()

        count += 1
        size_sum += len(data)
        if now - t0 >= 5:
            fps = count / (now - t0)
            kb = size_sum / count / 1024
            print(f"camera: {fps:.1f} fps, {kb:.1f} KB/frame, ~{fps * kb * 8 / 1024:.1f} Mbps")
            count, size_sum, t0 = 0, 0, now


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path.split("?")[0] != "/stream.mjpg":
            self.send_error(404, "Use /stream.mjpg")
            return
        try:
            self.connection.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, SEND_BUFFER)
            self.connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        except OSError:
            pass
        self.send_response(200)
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        print(f"client connected: {self.client_address[0]}")
        last_id = -1
        try:
            while True:
                with cond:
                    cond.wait_for(lambda: frame_id != last_id, timeout=2.0)
                    if frame_id == last_id:
                        continue
                    img, last_id = latest_jpeg, frame_id   # always the newest frame
                self.wfile.write(
                    b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                    + str(len(img)).encode() + b"\r\n\r\n" + img + b"\r\n"
                )
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            print(f"client disconnected: {self.client_address[0]}")


def main():
    threading.Thread(target=camera_loop, daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    server.daemon_threads = True
    print(f"Streaming {WIDTH}x{HEIGHT} at http://<pi-ip>:{PORT}/stream.mjpg")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
