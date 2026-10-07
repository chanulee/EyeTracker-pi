/** 개발·?dev=1 전용 — 프로덕션 UI/플로우와 분리된 커스텀 이벤트 */

export const DEV_VOICE_EVENT = 'seoul-dev-voice';
export const DEV_PASS_GAZE_EVENT = 'seoul-dev-pass-gaze';
export const DEV_MOBILE_INPUT_EVENT = 'seoul-dev-mobile-input';

export function isDevAssistEnabled(query) {
  if (typeof window === 'undefined') return false;
  if (process.env.NODE_ENV === 'development') return true;
  const dev = query?.dev;
  return dev === '1' || dev === 'true';
}

export function emitDevVoice({ text, viewer = 'A', submit = false }) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(DEV_VOICE_EVENT, {
      detail: {
        text: text ?? '',
        viewer: viewer === 'B' ? 'B' : 'A',
        submit: Boolean(submit),
      },
    })
  );
}

export function emitDevPassGaze() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DEV_PASS_GAZE_EVENT));
}

export function emitDevMobileInput({ text, submit = false }) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(DEV_MOBILE_INPUT_EVENT, {
      detail: { text: text ?? '', submit: Boolean(submit) },
    })
  );
}
