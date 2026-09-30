> **이 문서는 기존 학생 MJPEG/Windows 데모입니다.** 새 Pi Zero 2 W → Mac mini WebSocket 구성은 [한국어 운영 매뉴얼](../../exhibition/docs/SETUP_KO.md)을 사용하세요. 기존 파일은 참고용으로 유지합니다.

# Raspberry Pi Eye Tracker Test Demo

저장소 정리 후 카메라 송신기는 `legacy/ForRaspberrypi/pi_camera_stream.py`, 커서 서버와 HTML은 `legacy/3DTracker/gaze_cursor_server.py`, `legacy/3DTracker/gaze_demo.html`에 있습니다. 아래 예전 실행 설명에서 파일을 복사할 때 이 경로를 사용하세요.

This project uses the 3D eye tracker from [JEOresearch/EyeTracker](https://github.com/JEOresearch/EyeTracker), with a Raspberry Pi as a wireless eye camera.

```
[Eye camera] --USB--> [Raspberry Pi] --Wi-Fi--> [Laptop]
                       sends frame only          runs the 3D tracker
                                                 + shows the gaze cursor in a browser
```

---

## What you need

**Files from this project**

| File                    | Goes on      | What it does                                                |
| ----------------------- | ------------ | ----------------------------------------------------------- |
| `pi_camera_stream.py`   | Raspberry Pi | Streams the camera over Wi-Fi                               |
| `gaze_cursor_server.py` | Laptop       | Reads the tracker's gaze output and sends it to the browser |
| `gaze_demo.html`        | Laptop       | The demo page: calibration, cursor, word tiles for example  |

You also need Orlosky3DEyeTracker file from original repo.

---

## Raspberry Pi Setup

### From 1.1 to 1.3, you can instead use imager for setup if you want to start fresh.

### 1.1 Network

If you can control raspberry pi through vnc or other way, add your network that will be used.
If you cannot control it, instead use same wifi name and password for your phone's hotspot and turn on maximize capability.

### 1.2 Find the Pi's IP address and log in

Connect your laptop to the same Wi-Fi or hotspot. In **PowerShell** connect to pi.

### 1.4 Install the software

In SSH:

```bash
sudo apt update
sudo apt install -y python3-opencv python3-numpy python3-venv v4l-utils

mkdir -p ~/EyeTracker
cd ~/EyeTracker
python3 -m venv --system-site-packages venv
```

Check that the camera is detected:

```bash
ls /dev/video*
```

You should see `/dev/video0`. If the camera shows up under another number, change `CAMERA_INDEX` in `pi_camera_stream.py`.

### 1.5 Copy the streamer to the Pi

In **PowerShell on the laptop**, go to the folder that contains `pi_camera_stream.py` and run:

```
scp pi_camera_stream.py <username>@<pi-ip>:~/EyeTracker/
```

---

## Windows Setup

### 2.1 Prerequisites

- **Python**

### 2.2 Virtual environment

```
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install opencv-python numpy
```

### 2.2 Orlosky3DEyeTracker

**Image upside down (optional):** the tracker flips the image (`frame = cv2.flip(frame, 0)` in `process_camera()`). If your eye appears upside down in the tracker window, delete that line.

## 3. Running Demo

### 3.1 Pi: start the camera stream

SSH into the Pi:

```bash
cd ~/EyeTracker
source venv/bin/activate
python pi_camera_stream.py
```

**Check:** open `http://<pi-ip>:8000/stream.mjpg` in the laptop's browser. You should see live video. Close the tab afterwards.

### 3.2 Laptop: start the 3D tracker (VS Code terminal 1)

```
cd C:\eyetrack\EyeTracker\legacy\3DTracker
.\venv\Scripts\Activate.ps1
python Orlosky3DEyeTracker.py
```

1. Type `http://<pi-ip>:8000/stream.mjpg` into the camera box.
2. Click **Start Camera**.
3. Slowly look around in all directions until the eye circle is stable.
4. Press **F** to lock the eye model.

The tracker now writes your gaze direction to `gaze_vector.txt`.

### 3.3 Laptop: start the cursor server (VS Code terminal 2)

Click **+** in the terminal panel to open a second terminal:

```
cd C:\eyetrack\EyeTracker\legacy\3DTracker
.\venv\Scripts\Activate.ps1
python gaze_cursor_server.py
```

### 3.4 Browser: calibrate and use it

1. Open **http://localhost:8080**.
2. The top bar should show **Connected** and **Pupil found**.
3. Click **Full screen**, then **Calibrate**.

### Stopping

- Tracker window: press **Q**.
- The other terminals and the Pi: press **Ctrl+C**.
- To shut down the Pi safely, run `sudo shutdown now` and wait for the green light to stop before unplugging.

### Making your own calibration and demo

- Run Steps 3.1–3.3, then edit `gaze_demo.html` as you want and refresh the browser. The page gets the gaze data from `http://localhost:8080/stream`. Each message is JSON like `{"ok": true, "x": ..., "y": ..., "fps": ...}`, where `ok` is `false` when the pupil is lost.

---

## Credits

`Orlosky3DEyeTracker.py` is from [JEOresearch/EyeTracker](https://github.com/JEOresearch/EyeTracker) (MIT license, see the repository-root `LICENSE`), modified to read a network stream and use the newest frame.
