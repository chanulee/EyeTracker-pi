const PLANT_KEYWORDS = ['나무', '화분', '식물', '꽃', '덩쿨', '덩굴', '잔디', '정원', '숲', '가로수'];
const SENSE_KEYWORDS = ['향', '냄새', '물소리', '그늘', '시원', '색', '푸른'];
const USE_KEYWORDS = ['앉', '쉬', '먹', '산책', '놀이', '모임', '벤치'];

function includesAny(text, keywords) {
  return keywords.some((word) => text.includes(word));
}

const GENERIC_QUESTIONS = [
  '어떤 식물을, 어느 계절에 가장 잘 어울린다고 상상하시나요?',
  '그 식물이 자라면 이곳의 분위기가 어떻게 달라질까요? 구체적으로 들려주세요.',
  '누가 이 공간을 가장 많이 쓰게 될까요? 그 사람들에게 어떤 경험을 주고 싶으신가요?',
  '색, 향, 질감 중 하나를 고른다면 무엇을 가장 강조하고 싶으신가요?',
  '10년 뒤 이곳을 지나는 사람이 어떤 한마디를 하면 좋겠나요?',
];

const PLANT_QUESTIONS = [
  '어떤 종류의 식물을 심고 싶으신가요? 키, 잎 모양, 꽃 유무까지 상상해 주세요.',
  '그 식물이 자라면 그늘은 얼마나 드리워질까요? 하루 중 언제가 가장 시원할까요?',
];

const SENSE_QUESTIONS = [
  '그 향이나 소리는 언제 가장 잘 느껴졌으면 하나요? 아침, 저녁, 비 오는 날처럼요.',
  '그 감각이 주변 사람들에게 어떤 기분을 전해줄 것 같나요?',
];

const USE_QUESTIONS = [
  '사람들이 이곳에서 구체적으로 무엇을 하길 바라시나요?',
  '앉거나 머무는 방식까지 포함해, 공간 사용 장면을 조금 더 그려주실 수 있을까요?',
];

const PLANT_NAMES = [
  '개나리', '장미', '해바라기', '라벤더', '민들레', '벚나무', '소나무', '단풍나무',
  '은행나무', '버드나무', '느티나무', '자작나무', '이팝나무', '대나무', '목련',
  '수국', '튤립', '무궁화', '코스모스', '철쭉', '진달래', '담쟁이', '아이비',
  '이끼', '선인장', '덩굴', '덩쿨', '가로수', '잔디', '갈대', '연꽃', '꽃', '나무', '식물',
];

function hasFinalConsonant(word) {
  const last = Array.from(word).at(-1);
  const code = last?.charCodeAt(0) || 0;
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
}

function withParticle(word, consonantParticle, vowelParticle) {
  return `${word}${hasFinalConsonant(word) ? consonantParticle : vowelParticle}`;
}

function visibleParts(plant) {
  if (/(개나리|장미|해바라기|라벤더|민들레|목련|수국|튤립|무궁화|코스모스|철쭉|진달래|연꽃|꽃)/.test(plant)) {
    return '잎과 꽃';
  }
  if (/(나무|가로수|소나무|대나무)/.test(plant)) return '잎과 가지';
  return '잎과 줄기';
}

const LOOK_AXES = [
  {
    id: 'color',
    hit: /색|빛깔|빨강|빨간|붉|주황|노랑|노란|금색|초록|연두|청록|파랑|파란|남색|보라|분홍|하양|하얀|흰|검정|검은/,
    questions: [
      (plant) => `${plant}의 ${withParticle(visibleParts(plant), '을', '를')} 함께 떠올리면, 어떤 색들이 섞여 보여야 가장 잘 어울릴까요?`,
      (plant) => `햇빛과 그늘에서 ${plant}의 빛깔이 달라진다면, 각각 어떤 색으로 보이면 좋을까요?`,
      (plant) => `${withParticle(plant, '이', '가')} 멀리서도 눈에 띄게 하려면, 중심과 가장자리를 어떤 색으로 그려볼까요?`,
      (plant) => `계절에 따라 ${plant}의 색이 변한다면, 처음과 마지막에는 각각 어떤 빛깔이면 좋을까요?`,
      (plant) => `${plant}의 색을 한 가지로 정하지 않는다면, 어떤 두 색이 자연스럽게 이어지면 좋을까요?`,
      (plant) => `밤에 거리의 조명이 켜졌을 때, ${plant}의 색은 낮과 어떻게 다르게 보이면 좋을까요?`,
    ],
  },
  {
    id: 'texture',
    hit: /질감|보슬|매끈|까칠|거칠|촉촉|부드|폭신|단단|결|만지|털|윤기|반짝/,
    questions: [
      (plant) => `${withParticle(plant, '을', '를')} 손으로 만진다고 상상하면, 잎과 줄기에서 각각 어떤 질감이 느껴질까요?`,
      (plant) => `햇빛을 받는 ${plant}의 잎은 은은하게 빛나는 표면과 잔잔한 결이 보이는 표면 중 어느 쪽이 어울릴까요?`,
      (plant) => `${plant}의 잎을 가까이에서 본다면, 표면의 결은 어떤 모습이면 좋을까요?`,
      (plant) => `도심의 먼지가 쉽게 달라붙지 않으려면, ${plant}의 잎 표면은 어떤 질감이면 좋을까요?`,
      (plant) => `${plant}의 겉과 속이 서로 다른 촉감이라면, 각각 어떤 느낌이면 좋을까요?`,
      (plant) => `사람 손이 닿는 낮은 잎과 높이 자란 잎의 촉감은 어떻게 다르면 좋을까요?`,
    ],
  },
  {
    id: 'shape',
    hit: /형태|모양|동그|둥글|뾰족|굵|가늘|넓|잎|줄기|꽃잎|뻗|휘|늘어|퍼지|키가|크기/,
    questions: [
      (plant) => `${withParticle(plant, '이', '가')} 자라는 모습을 그려 보면, 줄기와 가지는 어느 방향으로 어떤 모양을 만들까요?`,
      (plant) => `${plant}의 ${withParticle(visibleParts(plant), '은', '는')} 크기와 형태가 어떻게 달라야 더 특별해 보일까요?`,
      (plant) => `멀리서 바라본 ${plant}의 전체 윤곽은 둥글게 모일까요, 길게 퍼져 나갈까요?`,
      (plant) => `${withParticle(plant, '이', '가')} 건물과 맞닿아 자란다면, 어느 방향으로 뻗는 형태가 가장 어울릴까요?`,
      (plant) => `${plant}의 줄기에서 잎이 펼쳐지는 순서를 상상하면, 어떤 모양으로 이어지면 좋을까요?`,
      (plant) => `창문과 보행 공간을 가리지 않으면서 그늘을 만들려면, ${plant}의 가지는 어떤 형태로 자라야 할까요?`,
    ],
  },
];

const IMPACT_QUESTIONS = [
  (plant) => `${withParticle(plant, '이', '가')} 이곳에 자리 잡으면, 아침에 문을 여는 가게 앞 풍경부터 어떻게 달라질까요?`,
  (plant) => `한여름 낮에 ${withParticle(plant, '이', '가')} 충분히 자라 있다면, 이 길을 걷는 사람은 무엇을 다르게 느낄까요?`,
  (plant) => `${plant} 때문에 이곳을 지나는 사람들이 걷거나 쉬는 모습은 어떻게 달라질까요?`,
  (plant) => `비가 오는 날에도 ${withParticle(plant, '이', '가')} 이곳에 있다면, 사람들이 머무는 모습은 어떻게 달라질까요?`,
  (plant) => `${withParticle(plant, '이', '가')} 만든 변화가 옆 건물과 골목까지 이어진다면, 어디부터 달라지면 좋을까요?`,
  (plant) => `10년 뒤 ${withParticle(plant, '이', '가')} 건물 2층 높이까지 자라 있다면, 사람들은 이 자리를 어떻게 이용하고 있을까요?`,
  (plant) => `${withParticle(plant, '이', '가')} 자리 잡기 전과 비교하면, 이 거리에서 가장 크게 개선될 점은 무엇일까요?`,
  (plant) => `밤이 되어 불빛이 켜진 뒤에도 ${withParticle(plant, '이', '가')} 보인다면, 이 거리는 어떤 장소로 기억될까요?`,
  (plant) => `${withParticle(plant, '이', '가')} 서울의 다른 골목에도 퍼진다면, 시민의 하루 중 어떤 순간이 가장 달라질까요?`,
];

function textHash(text) {
  return Array.from(String(text || '')).reduce(
    (hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0,
    2166136261
  );
}

function plantName(text) {
  const value = String(text || '');
  const genericNames = new Set(['꽃', '나무', '식물']);
  const found = PLANT_NAMES.find((name) => !genericNames.has(name) && value.includes(name));
  if (found) return found;

  const planted = value.match(/([가-힣]{2,12})(?:을|를)?\s*(?:심고|심으면|심어|심을|키우|자라면)/)?.[1];
  if (planted) {
    const candidate = planted.replace(/(을|를)$/, '');
    const isDescription = /게$/.test(candidate) || /^(여기에|저기에|이곳에|저곳에|많이|조금|크게|작게)$/.test(candidate);
    if (!isDescription) return candidate;
  }

  return PLANT_NAMES.find((name) => genericNames.has(name) && value.includes(name)) || '그 식물';
}

function describedPlant(plant, text) {
  const value = String(text || '');
  const color = value.match(/(빨간|붉은|주황색?|노란|금색|초록색?|연두색?|청록색?|파란|남색|보라색?|분홍색?|하얀|흰|검은)/)?.[0];
  if (color) return `${color} ${plant}`;
  const texture = value.match(/(보슬보슬|매끈|까칠|거칠|촉촉|부드럽|폭신|단단|반짝)/)?.[0];
  if (texture) {
    const adjective = texture.endsWith('럽') ? `${texture}게 느껴지는` : `${texture}한`;
    return `${adjective} ${plant}`;
  }
  const shape = value.match(/(큰|작은|높은|낮은|동그란|둥근|뾰족한|굵은|가느다란|넓은|길게 뻗는|아래로 늘어지는)/)?.[0];
  return shape ? `${shape} ${plant}` : plant;
}

function contextualReactions(subject, plant) {
  if (/(덩쿨|덩굴|담쟁이|아이비)/.test(plant)) {
    return [
      `${withParticle(subject, '이', '가')} 벽을 따라 퍼지는 장면이 선명해요.`,
      `벽을 채울 ${subject}의 움직임이 눈에 보여요.`,
      `${subject}의 줄기가 공간을 채우는 모습이 인상적이에요.`,
    ];
  }
  if (/(나무|가로수|소나무|대나무)/.test(plant)) {
    return [
      `${subject}의 가지가 펼쳐진 장면이 선명해요.`,
      `그 자리를 채울 ${subject}의 크기가 인상적이에요.`,
      `${subject}의 그늘이 드리운 모습이 눈앞에 보여요.`,
    ];
  }
  if (/(꽃|개나리|장미|해바라기|라벤더|민들레|목련|수국|튤립|무궁화|코스모스|철쭉|진달래|연꽃)/.test(plant)) {
    return [
      `${withParticle(subject, '이', '가')} 피어난 자리가 한층 또렷해 보여요.`,
      `${subject}의 색이 공간을 채울 장면이 눈에 보여요.`,
      `그곳에 펼쳐질 ${subject}의 모습이 인상적이에요.`,
    ];
  }
  return [
    `${withParticle(subject, '이', '가')} 자랄 장면이 구체적으로 그려져요.`,
    `그 자리를 채울 ${subject}의 모습이 인상적이에요.`,
    `${subject}의 특징이 공간과 잘 어울릴 것 같아요.`,
  ];
}

function normalizeQuestion(text) {
  return String(text || '').replace(/\s+/g, '').replace(/[.,!?…"'“”]/g, '');
}

function chooseUnseen(lines, seed, previousQuestions) {
  const previous = (previousQuestions || []).map(normalizeQuestion);
  const ordered = lines.map((_, index) => lines[(seed + index) % lines.length]);
  return ordered.find((line) => {
    const normalized = normalizeQuestion(line);
    return !previous.some((old) => old === normalized || old.includes(normalized) || normalized.includes(old));
  }) || ordered[0];
}

export function buildFollowUpQuestion(opinion, visionLabel = '', followUp, options = {}) {
  const initialOpinion = String(options.initialOpinion || opinion || '').trim();
  const latestAnswer = String(options.latestAnswer || opinion || '').trim();
  const text = `${initialOpinion} ${latestAnswer} ${visionLabel}`.trim();
  const seed = textHash(text);
  const plant = plantName(initialOpinion);
  const subject = Number(followUp) > 1
    ? describedPlant(plant, latestAnswer)
    : describedPlant(plant, initialOpinion);
  const previousQuestions = options.previousQuestions || [];
  const variation = previousQuestions.length;
  const reaction = chooseUnseen(contextualReactions(subject, plant), variation, previousQuestions);

  if (Number(followUp) === 1) {
    const missingAxes = LOOK_AXES.filter((axis) => !axis.hit.test(initialOpinion));
    const usedAxes = LOOK_AXES.filter((axis) => (
      previousQuestions.some((question) => axis.hit.test(question))
    ));
    const unseenAxes = missingAxes.filter((axis) => (
      !usedAxes.some((used) => used.id === axis.id)
    ));
    const axes = unseenAxes.length
      ? unseenAxes
      : missingAxes.length
        ? missingAxes
        : LOOK_AXES;
    const axis = axes[(seed + previousQuestions.length) % axes.length];
    const questions = axis.questions.map((question) => question(subject));
    return `${reaction} ${chooseUnseen(questions, variation, previousQuestions)}`;
  }
  if (Number(followUp) > 1) {
    const questions = IMPACT_QUESTIONS.map((question) => question(subject));
    return `${reaction} ${chooseUnseen(questions, variation, previousQuestions)}`;
  }

  let pool = [...GENERIC_QUESTIONS];
  if (includesAny(text, PLANT_KEYWORDS)) pool = [...PLANT_QUESTIONS, ...pool];
  if (includesAny(text, SENSE_KEYWORDS)) pool = [...SENSE_QUESTIONS, ...pool];
  if (includesAny(text, USE_KEYWORDS)) pool = [...USE_QUESTIONS, ...pool];
  return `${reaction} ${pool[seed % pool.length]}`;
}
