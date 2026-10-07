"""Live Pi MJPEG input; retain only the newest frame while detectors are busy."""
import asyncio
import time

import cv2
import numpy as np
from aiohttp import ClientSession, ClientTimeout, MultipartReader


class StreamCapture:
    def __init__(self):
        self.queue = asyncio.Queue(maxsize=1)
        self.session = self.response = self.task = None

    async def open(self, url):
        self.session = ClientSession(timeout=ClientTimeout(total=None, sock_connect=3, sock_read=3))
        try:
            self.response = await self.session.get(url)
            self.response.raise_for_status()
            self.task = asyncio.create_task(self.receive())
        except BaseException:
            await self.release()
            raise
        return self

    async def receive(self):
        reader = MultipartReader.from_response(self.response)
        while True:
            part = await reader.next()
            if part is None:
                raise ConnectionError('Pi 카메라 스트림 종료')
            length = int(part.headers.get('Content-Length', '0'))
            if not 0 < length <= 512 * 1024:
                raise ValueError('Pi JPEG 크기 오류')
            jpg = bytes(await part.read())
            if len(jpg) != length:
                raise ValueError('Pi JPEG 수신 불완전')
            if self.queue.full():
                self.queue.get_nowait()
            self.queue.put_nowait((time.monotonic(), jpg))

    def isOpened(self):
        return self.response is not None and not self.response.closed

    def get(self, prop):
        return 0  # Actual dimensions are filled from the first decoded frame.

    async def read(self):
        while True:
            if self.task.done():
                self.task.result()
            stamp, jpg = await asyncio.wait_for(self.queue.get(), timeout=3)
            if time.monotonic() - stamp <= .35:
                image = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR)
                return image is not None, image

    async def release(self):
        if self.task:
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)
        if self.session:
            await self.session.close()
