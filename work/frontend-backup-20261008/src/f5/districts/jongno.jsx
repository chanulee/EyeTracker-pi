import LightField from '../LightField';
import { growSpeechStops } from '../endingCues';

const plants = [
  { id: 'jongno-1', name: '몬스테라', image: '/4/plant-left.png', tone: 'lilac' },
  { id: 'jongno-2', name: '금목서향새싹', image: '/4/plant-right.png', tone: 'mint' },
  { id: 'jongno-3', name: '새싹', image: '/4/plant-left.png', tone: 'lilac' },
];

// 1~2 영상은 이 시점(초)부터 2 말풍선.
const INTRO_HOLD = { cue2At: 1.6 };

// 첫 영상의 첫 프레임 사진. 영상이 디코딩되기 전 검은 화면이 보이지 않게 깔아 둔다.
export const poster = '/5/jongno/poster.jpg';
const POSTER = poster;

// 3~7 영상은 1초 지점까지 느리게 다가가 멈춘 채 3 → 4, 그 뒤 슬로모션 구간에서 5 → 7.
// ringFill·ringEnd·ringHide는 슬로모션 구간(1초~끝) 안의 비율: 링이 다 차는 지점, 7로 넘어가는 지점,
// 다 찬 링이 사라지는 지점. 이 구간에서 0.06 ≈ 실제 1초.
const GROW_HOLD = {
  at: 1,
  approachRate: 0.5,
  cue3Ms: 5000,
  cue4Ms: 5000,
  slowRate: 0.25,
  ringFill: 0.53,
  ringEnd: 0.62,
  ringHide: 0.74,
};

// 9~10 영상은 끝 프레임에서 멈춘 채 10(cue10Ms) → 11(cue11Ms)을 보여 준 뒤 다음 영상으로 넘어간다.
const BLOOM_HOLD = { at: 4.8, cue10Ms: 4500, cue11Ms: 3500 };

// 14~17 영상은 살짝 느리게 16, 끝 프레임에서 멈춘 채 16을 조금 더 보여 주고 17.
const FINALE_HOLD = { at: 4.9, rate: 0.85, cue16Ms: 2500, cue17Ms: 7500 };
// 위 시간들은 최소값이다. TTS가 아직 읽는 중이면 멘트 경계(speechStops·freezeStops)와 영상 끝에서 멈춰 기다린다.

export const name = '종로구';
export const assets = plants;
// 업스케일 영상을 번호 순서대로 잇는다. fade는 이 영상의 끝과 다음 영상의 시작이 겹치는 시간이다.
export const shots = [
  // fade 가 길면 그만큼 끝부분이 다음 영상에 덮인다. 1~2는 끝 프레임까지 보여 주려고 짧게 둔다.
  {
    kind: 'video',
    src: '/5/jongno/1-2.mp4',
    poster: POSTER,
    fade: 400,
    story: 'intro',
    hold: INTRO_HOLD,
  },
  {
    kind: 'video',
    src: '/5/jongno/3-7.mp4',
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
    speechStops: growSpeechStops(GROW_HOLD), // 5 → 7
  },
  { kind: 'video', src: '/5/jongno/8.mp4', fade: 1200, story: 'spread' },
  {
    kind: 'video',
    src: '/5/jongno/9-10.mp4',
    fade: 1200,
    story: 'bloom',
    hold: BLOOM_HOLD,
    freezeAt: BLOOM_HOLD.at,
    freezeMs: BLOOM_HOLD.cue10Ms + BLOOM_HOLD.cue11Ms,
    advanceAfterFreeze: true,
    speechStops: [BLOOM_HOLD.at], // 9 → 10
    freezeStops: [BLOOM_HOLD.cue10Ms], // 10 → 11
  },
  {
    kind: 'video',
    src: '/5/jongno/14-17.mp4',
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
  return <LightField color={0xfff4d2} rise={0.012} sway={0.0005} />;
}
