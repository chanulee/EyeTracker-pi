// SORA is the exhibition guide. Edit these fixed lines to match the live script.
// This file never requests a camera, IMU, microphone, or generated response.
export function guideAction(beat, zone = 'window') {
  const actions = {
    gaze: { kind: 'plant', text: '저는 오른쪽 건물 옆에 초록 덩굴을 심어볼게요.', nx: .68, ny: .57 },
    f1Gaze: { kind: 'plant', text: '이번에는 금색 건물의 창문에 식물이 자라는 모습을 보여드릴게요.', nx: .72, ny: .46 },
    speak: { kind: 'answer', text: '건물 사이에 초록 덩굴이 자라서 잠깐 쉬어갈 수 있는 거리가 되면 좋겠어요.' },
    ask1: { kind: 'question', text: '그 식물은 어떤 빛깔이면 좋겠나요?', next: 'reply1' },
    reply1: { kind: 'answer', text: '햇빛을 받으면 반짝이는 연두색 잎이 떠올라요.' },
    ask2: { kind: 'question', text: '그 식물이 이 거리를 어떻게 바꿀까요?', next: 'reply2' },
    reply2: { kind: 'answer', text: '지나가는 사람들이 시원한 그늘에서 쉬고 초록을 가까이 느끼면 좋겠어요.' },
    f1Speak: { kind: 'answer', text: '창문을 따라 작은 꽃과 덩굴이 자라서 건물이 초록 정원처럼 보이면 좋겠어요.' },
    f1Reply: { kind: 'answer', text: zone === 'building'
      ? 'NABI님이 상상한 식물이 건물에 자라면 삭막한 거리에도 생기가 돌 것 같아요.'
      : '사람들이 창가의 초록을 보며 편안하게 쉬어갈 수 있을 것 같아요.' },
  };
  return actions[beat] || null;
}

export function guidePlant(district = '종로구') {
  const variant = { 종로구: 'jongno-b', 마포구: 'mapo-c', 강남구: 'gangnam-b' }[district] || 'jongno-b';
  const image = `/4/plants/${variant}.png`;
  return { scripted: true, sent: true, plantName: 'SORA의 초록 정원', plantVariant: variant, plantImage: image, drawingUrl: image };
}

export const GUIDE_INPUT_BEATS = ['gaze', 'f1Gaze', 'speak', 'reply1', 'reply2', 'f1Speak', 'f1Reply', 'ask1', 'ask2'];
