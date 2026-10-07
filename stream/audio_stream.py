"""Share the existing microphone capture as 16 kHz mono S16_LE PCM."""
import array
import queue
import sys
import threading


def pcm16(raw):
    samples = array.array('i')
    samples.frombytes(raw)
    if sys.byteorder != 'little':
        samples.byteswap()
    if not samples or len(samples) % 3:
        raise ValueError('48 kHz S32_LE audio must contain groups of three samples')
    # Remove the I2S DC offset, then average 3 samples per output sample.
    # ponytail: box decimation for speech; use a proper resampler if music fidelity matters.
    mean = sum(samples) / len(samples)
    out = array.array('h', (max(-32768, min(32767, round(
        (sum(samples[i:i + 3]) / 3 - mean) / 65536))) for i in range(0, len(samples), 3)))
    if sys.byteorder != 'little':
        out.byteswap()
    return out.tobytes()


class AudioBus:
    def __init__(self):
        self.lock = threading.Lock()
        self.clients = set()

    def subscribe(self):
        client = queue.Queue(maxsize=4)
        with self.lock:
            self.clients.add(client)
        return client

    def unsubscribe(self, client):
        with self.lock:
            self.clients.discard(client)

    def publish(self, data):
        with self.lock:
            for client in self.clients:
                if client.full():
                    try:
                        client.get_nowait()
                    except queue.Empty:
                        pass  # A listener may have drained it since full().
                client.put_nowait(data)


AUDIO = AudioBus()
