"""Feed the 1P simulated worker, following its real calibration protocol."""
import json
import math
import time
from urllib.request import Request, urlopen
from eye_tracking.gaze import POINTS, VALIDATION_POINTS

while True:
    for user in (1,):
        base = f'http://127.0.0.1:{8079 + user}'
        with urlopen(base + '/api/status', timeout=2) as response:
            status = json.load(response)
        if status['calibrating']:
            count = status['calibration_points']
            point = POINTS[count] if count < 9 else VALIDATION_POINTS[min(2, status['validation_points'])]
        else:
            t = time.monotonic() * .35 + user
            point = (.5 + .25 * math.sin(t), .5 + .2 * math.cos(t))
        request = Request(base + '/api/demo', data=json.dumps(dict(zip(('x', 'y'), point))).encode(),
                          headers={'Content-Type': 'application/json', 'Origin': base})
        with urlopen(request, timeout=2) as response:
            response.read()
    time.sleep(1 / 30)
