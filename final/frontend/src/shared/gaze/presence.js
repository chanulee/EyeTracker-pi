import { eulerFromMatrix } from './features';

const DEG = 180 / Math.PI;

/**
 * 키오스크 앞 사람을 아이맥 카메라로 판정하는 기준.
 * 카메라가 좌대(63~80cm) 위에서 올려다보므로 상체·얼굴만 잡히고, 고개가 위아래로 꽤 기울어 보인다.
 * 눈동자는 쓰지 않고 얼굴 크기·위치·고개 방향만 본다.
 */
export const PRESENCE = {
  people: 2,
  holdMs: 15000,
  // 검출이 잠깐 끊겨도 이 시간 안에 돌아오면 누적 시간을 지우지 않는다.
  graceMs: 1500,
  intervalMs: 100,
  maxFaces: 6,
  // 얼굴 폭 / 화면 폭. 앞에 선 사람을 넉넉히 받고, 멀리 지나가는 사람만 거른다.
  minFaceWidth: 0.04,
  // 가장 큰 얼굴의 이 비율보다 작으면 뒤쪽 사람으로 본다. 한 발 뒤에 선 동행은 포함한다.
  minRelativeWidth: 0.4,
  // 얼굴이 화면 좌우 끝에 걸쳐 있으면 들어오거나 나가는 중으로 본다.
  edgeMargin: 0.02,
  maxYawDeg: 38,
  // 올려다보는 각도 때문에 정면을 봐도 pitch 가 0에서 벗어난다. 현장에서 ?presenceDebug=1 로 보고 맞춘다.
  pitchCenterDeg: 0,
  maxPitchDeg: 45,
  // 모자 챙이 이마를 가리고 눈가에 그림자를 드리우면 검출 점수가 기본값 0.5 아래로 떨어진다.
  // 뒤쪽 오검출은 얼굴 크기 조건이 거르므로 점수 기준은 낮게 둔다.
  detectionConfidence: 0.3,
  presenceConfidence: 0.3,
  trackingConfidence: 0.3,
  // 모자를 쓰면 검출이 한두 프레임씩 끊기고 고개 각도도 튄다.
  // stickyMs 동안은 마지막 위치로 사람을 붙잡아 두고, poseSmooth 로 각도를 눌러 떨림을 없앤다.
  stickyMs: 1200,
  poseSmooth: 0.3,
  // 같은 사람으로 이을 때 허용하는 얼굴 중심 이동량(화면 비율).
  matchDist: 0.15,
  cameraLabel: /facetime|built-in|내장/i,
  cameraStorageKey: 'seoul-presence-camera',
};

export function landmarkerOptions(config = PRESENCE) {
  return {
    numFaces: config.maxFaces,
    detection: config.detectionConfidence,
    presence: config.presenceConfidence,
    tracking: config.trackingConfidence,
  };
}

function measureFace(lm, matrix) {
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const p of lm) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const pose = matrix?.length >= 16 ? eulerFromMatrix(matrix) : null;
  return {
    minX,
    maxX,
    minY,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    width: maxX - minX,
    yaw: pose ? pose.yaw * DEG : 0,
    pitch: pose ? pose.pitch * DEG : 0,
  };
}

/** near 는 고개 방향과 상관없이 키오스크 앞에 서 있는 얼굴이다. */
function judge(face, largest, config) {
  const reasons = [];
  if (face.width < config.minFaceWidth) reasons.push('멀다');
  else if (face.width < largest * config.minRelativeWidth) reasons.push('뒤쪽');
  const near = reasons.length === 0;
  if (face.minX < config.edgeMargin || face.maxX > 1 - config.edgeMargin || face.cy <= 0 || face.cy >= 1) {
    reasons.push('가장자리');
  }
  if (Math.abs(face.yaw) > config.maxYawDeg) reasons.push('고개 좌우');
  if (Math.abs(face.pitch - config.pitchCenterDeg) > config.maxPitchDeg) reasons.push('고개 위아래');
  return { reasons, near, ok: reasons.length === 0 };
}

/** 한 프레임만 보고 판정한다. 끊김을 메우지 않으니, 사람 수를 세려면 createPresenceTracker 를 쓴다. */
export function evaluateFaces(result, config = PRESENCE) {
  const measured = (result?.faceLandmarks || []).map((lm, i) =>
    measureFace(lm, result.facialTransformationMatrixes?.[i]?.data)
  );
  const largest = measured.reduce((max, face) => Math.max(max, face.width), 0);
  const faces = measured.map((face) => ({ ...face, ...judge(face, largest, config) }));
  const kept = faces.filter((face) => face.ok).sort((a, b) => b.width - a.width);
  return { faces, kept };
}

/**
 * 프레임마다 같은 사람을 이어 보면서 판정한다.
 * 검출이 끊겨도 stickyMs 동안은 마지막 자리에 사람이 있다고 보고(stale), 고개 각도는 눌러서 쓴다.
 * 모자나 그림자 때문에 한두 프레임 놓쳐도 인원수가 흔들리지 않는다.
 */
export function createPresenceTracker() {
  let tracks = [];
  let nextId = 1;

  return {
    update(result, now, config = PRESENCE) {
      const measured = (result?.faceLandmarks || []).map((lm, i) =>
        measureFace(lm, result.facialTransformationMatrixes?.[i]?.data)
      );

      const taken = new Set();
      tracks.forEach((track) => {
        let best = -1;
        let bestDist = config.matchDist;
        measured.forEach((face, i) => {
          if (taken.has(i)) return;
          const dist = Math.hypot(face.cx - track.cx, face.cy - track.cy);
          if (dist < bestDist) {
            bestDist = dist;
            best = i;
          }
        });
        if (best < 0) {
          track.fresh = false;
          return;
        }
        taken.add(best);
        const face = measured[best];
        const blend = Math.min(1, Math.max(0.05, config.poseSmooth));
        track.fresh = true;
        track.seenAt = now;
        track.cx = face.cx;
        track.cy = face.cy;
        track.minX = face.minX;
        track.maxX = face.maxX;
        track.minY = face.minY;
        track.maxY = face.maxY;
        track.width += (face.width - track.width) * blend;
        track.yaw += (face.yaw - track.yaw) * blend;
        track.pitch += (face.pitch - track.pitch) * blend;
      });

      measured.forEach((face, i) => {
        if (taken.has(i)) return;
        tracks.push({ ...face, id: nextId++, fresh: true, seenAt: now });
      });

      tracks = tracks.filter((track) => now - track.seenAt <= config.stickyMs);

      const largest = tracks.reduce((max, track) => Math.max(max, track.width), 0);
      const faces = tracks.map((track) => ({
        ...track,
        ...judge(track, largest, config),
        stale: !track.fresh,
      }));
      const kept = faces.filter((face) => face.ok).sort((a, b) => b.width - a.width);
      return { faces, kept };
    },
  };
}

/** 검출이 graceMs 넘게 끊기면 누적 시간을 0으로 돌린다. hold 는 { heldMs, lastOkAt } 를 그대로 고친다. */
export function advanceHold(hold, ok, now, dt, config = PRESENCE) {
  if (ok) {
    hold.lastOkAt = now;
    hold.heldMs += dt;
  } else if (now - hold.lastOkAt > config.graceMs) {
    hold.heldMs = 0;
  }
  return Math.min(1, hold.heldMs / config.holdMs);
}

export async function videoInputs() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === 'videoinput');
}

export function pickCamera(devices, want) {
  if (want) {
    const needle = want.toLowerCase();
    const hit = devices.find(
      (device) => device.deviceId === want || device.label.toLowerCase().includes(needle)
    );
    if (hit) return hit.deviceId;
  }
  return devices.find((device) => PRESENCE.cameraLabel.test(device.label))?.deviceId || '';
}

function cameraConstraints(deviceId) {
  return {
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
    audio: false,
  };
}

// 권한을 받기 전에는 장치 이름이 비어 있으므로, 기본 카메라로 한 번 연 뒤 다시 고른다.
export async function openCamera(want) {
  let id = pickCamera(await videoInputs(), want);
  let stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(id));
  if (!id) {
    id = pickCamera(await videoInputs(), want);
    const current = stream.getVideoTracks()[0]?.getSettings().deviceId;
    if (id && id !== current) {
      stream.getTracks().forEach((track) => track.stop());
      stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(id));
    }
  }
  return stream;
}
