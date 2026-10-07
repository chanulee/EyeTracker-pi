import { VOTE_VIEWER_IDS } from '../gazeConfig';

// A=NABI는 카메라 착용자. B=SORA는 장치 없이 진행하는 안내 시나리오.
// UI 쪽에서 시선 엔진 훅을 끌어오지 않고 이 이름들만 쓸 수 있게 따로 둔다.
export const CAM_KEYS = ['A', 'B'];
export const VIEWER_BY_CAM = { A: VOTE_VIEWER_IDS[0], B: VOTE_VIEWER_IDS[1] };
export const PERSON_LABEL = { A: 'NABI', B: 'SORA' };
// NABI 연두 / SORA 연보라. 시선 커서 glow 와 디버그 HUD 에 쓴다.
export const CAM_COLOR = { A: '#9ae86b', B: '#c7a6f2' };
