import LightField from '../LightField';
import { growSpeechStops } from '../endingCues';

const plants = [
  { id: 'gangnam-1', name: '몬스테라', image: '/4/plant-left.png', tone: 'lilac' },
  { id: 'gangnam-2', name: '금목서향새싹', image: '/4/plant-right.png', tone: 'mint' },
  { id: 'gangnam-3', name: '새싹', image: '/4/plant-left.png', tone: 'lilac' },
];

// 피그마 강남구1–15 프레임. 영상 번호도 이 프레임 번호라 종로구(1–17)와 다르게 잘려 있다.
//   1~2 intro · 3~7 grow(시선 링, 6 멘트 추가) · 7~9 spread(8 → 9) · 10~11 bloom · 12~13 rise(위로)
//   14 finale(13·14 멘트 = 종로구 16·17) · 15 QR
// 1~2 영상은 이 시점(초)부터 2 말풍선.
const INTRO_HOLD = { cue2At: 1.6 };

// 첫 영상의 첫 프레임 사진. 영상이 디코딩되기 전 검은 화면이 보이지 않게 깔아 둔다.
export const poster = '/5/gangnam/poster.jpg';
const POSTER = poster;

// 3~7 영상은 1초 지점까지 느리게 다가가 멈춘 채 3 → 4, 그 뒤 슬로모션 구간에서 5 → 6 → 7.
// ringFill·cue6From·ringEnd·ringHide는 슬로모션 구간(1초~끝) 안의 비율: 링이 다 차는 지점(= 6 "자라나는 모습이
// 보여서 기뻐요"), 7로 넘어가는 지점, 다 찬 링이 사라지는 지점. 이 구간에서 0.06 ≈ 실제 1초.
const GROW_HOLD = {
  at: 1,
  approachRate: 0.5,
  cue3Ms: 5000,
  cue4Ms: 5000,
  slowRate: 0.25,
  ringFill: 0.53,
  cue6From: 0.53,
  ringEnd: 0.7,
  ringHide: 0.74,
};

// 7~9 영상은 이 시점(초)까지 8 "도시 곳곳에서 자라나고 있어요", 그 뒤 9.
const SPREAD_HOLD = { cue9At: 2.6 };

// 10~11 영상은 끝 프레임에서 멈춘 채 10(cue10Ms) → 11(cue11Ms)을 보여 준 뒤 12~13으로 넘어간다.
const BLOOM_HOLD = { at: 4.8, cue10Ms: 4500, cue11Ms: 3500 };

// 14 영상은 살짝 느리게 13(=16), 끝 프레임에서 멈춘 채 조금 더 보여 주고 14(=17).
const FINALE_HOLD = { at: 4.9, rate: 0.85, cue16Ms: 2500, cue17Ms: 7500 };
// 위 시간들은 최소값이다. TTS가 아직 읽는 중이면 멘트 경계(speechStops·freezeStops)와 영상 끝에서 멈춰 기다린다.

export const name = '강남구';
export const assets = plants;
// 시선 링 위치(스테이지 px). 링 박스는 648이라 가운데는 left·top + 324.
// 피그마 강남구6의 링은 새싹(1초 프레임) 위에 있지만, 링이 보이는 동안 꽃이 위로 자라므로
// 다 자란 꽃송이(영상 3~4초) 가운데에 맞춘다: 왼쪽 (640, 1570) · 오른쪽 (3310, 1525).
export const rings = { A: { left: 316, top: 1246 }, B: { left: 2986, top: 1201 } };
// fade는 이 영상의 끝과 다음 영상의 시작이 겹치는 시간이다.
export const shots = [
  // 1~2는 끝 프레임이 3~7의 첫 프레임과 같아 겹쳐도 어색하지 않다.
  {
    kind: 'video',
    src: '/5/gangnam/1-2.mp4',
    poster: POSTER,
    fade: 1000,
    story: 'intro',
    hold: INTRO_HOLD,
  },
  {
    kind: 'video',
    src: '/5/gangnam/3-7.mp4',
    fade: 1000,
    story: 'grow',
    hold: GROW_HOLD,
    freezeAt: GROW_HOLD.at,
    freezeMs: GROW_HOLD.cue3Ms + GROW_HOLD.cue4Ms,
    approachRate: GROW_HOLD.approachRate,
    slowFrom: GROW_HOLD.at,
    slowUntil: 1e9,
    slowRate: GROW_HOLD.slowRate,
    holdCue: true,
    freezeStops: [GROW_HOLD.cue3Ms], // 3 → 4
    speechStops: growSpeechStops(GROW_HOLD), // 5 → 6 → 7
  },
  {
    kind: 'video',
    src: '/5/gangnam/7-9.mp4',
    fade: 1200,
    story: 'spread',
    hold: SPREAD_HOLD,
    speechStops: [SPREAD_HOLD.cue9At], // 8 → 9
  },
  {
    kind: 'video',
    src: '/5/gangnam/10-11.mp4',
    fade: 1200,
    story: 'bloom',
    hold: BLOOM_HOLD,
    freezeAt: BLOOM_HOLD.at,
    freezeMs: BLOOM_HOLD.cue10Ms + BLOOM_HOLD.cue11Ms,
    advanceAfterFreeze: true,
    speechStops: [BLOOM_HOLD.at], // 9 → 10
    freezeStops: [BLOOM_HOLD.cue10Ms], // 10 → 11
  },
  { kind: 'video', src: '/5/gangnam/12-13.mp4', fade: 1000, story: 'rise' },
  {
    kind: 'video',
    src: '/5/gangnam/14.mp4',
    fade: 600,
    story: 'finale',
    hold: FINALE_HOLD,
    freezeAt: FINALE_HOLD.at,
    freezeMs: FINALE_HOLD.cue16Ms + FINALE_HOLD.cue17Ms,
    approachRate: FINALE_HOLD.rate,
    advanceAfterFreeze: true,
    freezeStops: [FINALE_HOLD.cue16Ms], // 16 → 17
  },
];

export function Overlay() {
  return <LightField color={0xd7fff4} rise={0.028} sway={0.0007} />;
}
