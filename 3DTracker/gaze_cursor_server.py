#!/usr/bin/env python3
"""
Gaze cursor server for the laptop (Windows).

Reads gaze_vector.txt written by Orlosky3DEyeTracker.py and sends the gaze
direction to gaze_demo.html, which does calibration and draws the cursor.

Put this file and gaze_demo.html in the 3DTracker folder, then run:
    python gaze_cursor_server.py
and open  http://localhost:8080  in your browser.
"""
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8080
PI_STREAM_URL = "http://172.20.10.5:8000/stream.mjpg"   # camera preview in the page
HERE = os.path.dirname(os.path.abspath(__file__))
GAZE_FILE = os.path.join(HERE, "gaze_vector.txt")
STALE_AFTER = 0.3   # seconds without a new line = pupil lost

cond = threading.Condition()
state = {"ok": False, "x": 0.0, "y": 0.0, "fps": 0.0, "t": 0.0}


def read_gaze_loop():
    """Poll gaze_vector.txt and publish the gaze direction.

    The file holds: center_x, center_y, center_z, dir_x, dir_y, dir_z.
    The page expects camera-pixel-like values (it divides x by 640 and y by
    480), so the direction (-1..1) is scaled into that range. Calibration in
    the page takes care of the real mapping to the screen.
    """
    last_text, last_mtime, fps, last_update = None, 0.0, 0.0, time.time()
    while True:
        time.sleep(1 / 60)
        now = time.time()
        try:
            mtime = os.path.getmtime(GAZE_FILE)
            with open(GAZE_FILE, "r") as f:
                text = f.read().strip()
        except OSError:
            text, mtime = None, 0.0

        fresh = text and mtime != last_mtime
        if fresh:
            try:
                values = [float(v) for v in text.split(",")]
            except ValueError:
                values = []           # caught the file mid-write; try again
            if len(values) == 6:
                dx, dy = values[3], values[4]
                dt = now - last_update
                fps = 0.9 * fps + 0.1 * (1.0 / max(dt, 1e-3))
                last_update, last_mtime, last_text = now, mtime, text
                with cond:
                    state.update(ok=True, x=(dx + 1) / 2 * 640, y=(1 - (dy + 1) / 2) * 480,
                                 fps=round(fps, 1), t=now)
                    cond.notify_all()
                continue

        if now - last_update > STALE_AFTER:
            with cond:
                if state["ok"] or now - state["t"] > 0.5:
                    state.update(ok=False, fps=0.0, t=now)
                    cond.notify_all()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            self.send_page()
        elif path == "/stream":
            self.send_stream()
        elif path == "/video":
            self.send_response(302)            # preview comes straight from the Pi
            self.send_header("Location", PI_STREAM_URL)
            self.end_headers()
        else:
            self.send_error(404)

    def send_page(self):
        try:
            with open(os.path.join(HERE, "gaze_demo.html"), "rb") as f:
                body = f.read()
        except FileNotFoundError:
            self.send_error(404, "Put gaze_demo.html next to gaze_cursor_server.py")
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_stream(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        try:
            while True:
                with cond:
                    cond.wait(timeout=1.0)
                    msg = json.dumps(state)
                self.wfile.write(f"data: {msg}\n\n".encode())
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass


def main():
    if not os.path.exists(GAZE_FILE):
        print("Note: gaze_vector.txt not found yet. Start the tracker and its camera.")
    threading.Thread(target=read_gaze_loop, daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    server.daemon_threads = True
    print(f"Open http://localhost:{PORT} in your browser. Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
