export const MAX_EXPECTED_VIEWERS = 5;

// 카메라 A, B에 대응하는 두 참가자.
export const VOTE_VIEWER_IDS = ['viewer-1', 'viewer-2'];

export const GAZE_PIN_DURATION_MS = 4000;
export const GAZE_TAG_DWELL_TOLERANCE = 0.2;
export const GAZE_TAG_DWELL_GRACE_MS = 1400;
export const GAZE_LIKE_DURATION_MS = 2000;

export const REVEAL_AGENT_DIALOGUE_MS = 5000;
export const DISCUSSION_PHASE_MAX_MS = 120000;

export const PIN_HIT_RADIUS_PX = 48;

export const STREET_IMAGE =
  'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1200&h=700&fit=crop';

export const AGENT_DIALOGUE =
  '다섯 분의 의견이 이 거리를 바꿉니다. 무엇부터 손대야 할까요?';

export const ENV_OVERLAY_TEXT =
  '이 거리의 여름 낮 체감온도는 41도. 그늘이 덮는 면적은 전체의 8%입니다.';

export const DISCUSSION_PROMPT =
  '여러분이 상상한 서울, 어떻게 완성할 수 있을까요? 삭막한 거리에 각자로 식물을 심고 싶은 곳을 시선으로 고르고, 어떻게 바뀌면 좋을지 의견을 나눠주세요.';

export const DISCUSSION_GAZE_HINT =
  '개선하고 싶은 곳을 약 4초간 바라보세요. 원하는 위치를 찾을 때까지 시선을 유지하면 태그가 붙습니다.';

export const DISCUSSION_VOICE_PROMPT =
  '선택한 위치에 대한 의견을 말하거나 입력해 주세요. 말한 내용이 태그 위치에 붙습니다.';

export const DISCUSSION_FOLLOWUP_TITLE = 'AI가 조금 더 구체적으로 여쭤볼게요';
export const DISCUSSION_FOLLOWUP_HINT =
  '질문을 듣고 바로 답변을 말해 주세요. AI 질문이 끝나면 마이크가 자동으로 켜집니다.';
export const DISCUSSION_FOLLOWUP_LOADING = '당신의 의견을 바탕으로 질문을 준비하고 있어요…';
