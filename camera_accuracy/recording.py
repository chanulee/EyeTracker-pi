"""Local JSONL logs and untouched camera frames with a shared session clock."""
from datetime import datetime, timezone
import json
from pathlib import Path
import secrets
import re
import threading
import time
import zipfile

import cv2


class Recording:
    def __init__(self, root, fps):
        self.root = Path(root).resolve()
        self.fps = fps
        self.directory = None
        self.log = self.video = self.timeline = None
        self.frame_count = 0
        self.video_size = None
        self.error = None
        self.started = None
        self.video_file = None
        self.log_lock = threading.Lock()

    def prepare(self, metadata):
        if self.log is not None or self.video is not None:
            return
        identity = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + secrets.token_hex(4)
        self.directory = self.root / identity
        self.directory.mkdir(parents=True)
        self.started = time.monotonic()
        self.error = None
        self.frame_count = 0
        self.video_file = None
        self.metadata = dict(version=1, recording_id=identity, started_timestamp_ms=round(time.time() * 1000),
                             clock='host monotonic seconds; wall clock is Unix milliseconds',
                             video='camera pixels before crop/flip/overlay; MJPEG AVI, no audio',
                             nominal_video_fps=self.fps, segments=[], **metadata)
        self.save_metadata()

    def row(self, kind, data):
        now = time.monotonic()
        return dict(type=kind, timestamp_ms=round(time.time() * 1000), monotonic_s=now,
                    elapsed_s=now - self.started, **data)

    def save_metadata(self):
        path = self.directory / 'metadata.json'
        temporary = path.with_suffix('.tmp')
        temporary.write_text(json.dumps(self.metadata, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
        temporary.replace(path)

    def event(self, kind, **data):
        with self.log_lock:
            if self.log is not None:
                try:
                    self.log.write(json.dumps(self.row(kind, data), ensure_ascii=False, allow_nan=False) + '\n')
                    # Flush every row so a failed/crashed test leaves its diagnostic trail.
                    self.log.flush()
                except (OSError, ValueError) as error:
                    self.error = f'로그 저장 실패: {error}'
                    stream, self.log = self.log, None
                    try:
                        stream.close()
                    except OSError:
                        pass

    def start_log(self, metadata):
        if self.log is not None:
            raise ValueError('이미 로그 기록 중입니다')
        self.prepare(metadata)
        self.log = (self.directory / 'tracking.jsonl').open('a', encoding='utf-8')
        self.metadata['segments'].append(self.row('log_start', {}))
        self.save_metadata()
        self.event('log_start', snapshot=metadata)

    def stop_log(self):
        if self.log is None:
            raise ValueError('로그 기록 중이 아닙니다')
        self.event('log_stop')
        with self.log_lock:
            if self.log is not None:
                stream, self.log = self.log, None
                stream.close()
        self.metadata['segments'].append(self.row('log_stop', {}))
        self.save_metadata()

    def start_video(self, metadata, size):
        if self.video is not None:
            raise ValueError('이미 영상 녹화 중입니다')
        self.prepare(metadata)
        segment = 1 + sum(row['type'] == 'video_start' for row in self.metadata['segments'])
        self.video_file = f'camera-{segment:02d}.avi'
        self.video_size = tuple(size)
        writer = cv2.VideoWriter(str(self.directory / self.video_file), cv2.VideoWriter_fourcc(*'MJPG'), self.fps, self.video_size)
        if not writer.isOpened():
            writer.release()
            raise ValueError('MJPEG AVI 녹화 파일을 열 수 없습니다')
        try:
            self.timeline = (self.directory / f'camera-{segment:02d}-frames.jsonl').open('w', encoding='utf-8')
        except OSError:
            writer.release()
            raise
        self.video = writer
        self.frame_count = 0
        self.metadata['video_size'] = list(size)
        self.metadata['segments'].append(self.row('video_start', dict(file=self.video_file, size=list(size))))
        self.save_metadata()
        self.event('video_start', file=self.video_file, size=list(size), nominal_fps=self.fps)

    def write_video(self, image, seq, captured_s, processed_s):
        if self.video is None:
            return None
        if (image.shape[1], image.shape[0]) != self.video_size:
            raise ValueError('입력 해상도가 바뀌어 영상 녹화를 종료했습니다')
        self.video.write(image)
        index = self.frame_count
        row = self.row('video_frame', dict(video_file=self.video_file, video_frame_index=index, seq=seq,
                       capture_return_monotonic_s=captured_s, processed_monotonic_s=processed_s))
        self.timeline.write(json.dumps(row, allow_nan=False) + '\n')
        self.timeline.flush()
        self.frame_count += 1
        return index

    def stop_video(self):
        if self.video is None:
            raise ValueError('영상 녹화 중이 아닙니다')
        writer, self.video = self.video, None
        writer.release()
        timeline, self.timeline = self.timeline, None
        timeline.close()
        self.metadata['video_frames'] = self.frame_count
        self.metadata['segments'].append(self.row('video_stop', dict(file=self.video_file, frames=self.frame_count)))
        self.save_metadata()
        self.event('video_stop', file=self.video_file, frames=self.frame_count)

    def close(self):
        # Independent finalizers: a disk error must not leave the AVI writer open.
        for stop, active in ((self.stop_video, self.video), (self.stop_log, self.log)):
            if active is not None:
                try:
                    stop()
                except (OSError, ValueError, cv2.error) as error:
                    self.error = f'기록 종료 실패: {error}'

    def state(self):
        return dict(log_active=self.log is not None, video_active=self.video is not None,
                    video_frames=self.frame_count, video_file=self.video_file,
                    recording_id=self.directory.name if self.directory else None,
                    output_directory=str(self.directory) if self.directory else None, error=self.error,
                    download_url=f'/api/recording/{self.directory.name}.zip' if self.directory and self.log is None and self.video is None else None)

    def archive(self, identity):
        # Only existing, direct child sessions are readable; never accept a file path.
        if not re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}', identity):
            raise ValueError('기록 ID 형식이 올바르지 않습니다')
        directory = (self.root / identity).resolve()
        if directory.parent != self.root or not directory.is_dir():
            raise ValueError('기록을 찾을 수 없습니다')
        if directory == self.directory and (self.log is not None or self.video is not None):
            raise ValueError('로그와 영상 기록을 모두 종료한 뒤 다운로드하세요')
        destination = directory / 'recording.zip'
        if destination.exists():
            return destination
        temporary = destination.with_suffix('.zip.tmp')
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_STORED) as archive:
            for path in directory.iterdir():
                if path.suffix in ('.json', '.jsonl', '.avi'):
                    archive.write(path, path.name)
        temporary.replace(destination)
        return destination
