import styles from './Opening.module.css';

function CardCopy({ lines }) {
  return (
    <text
      x="725"
      y="627"
      textAnchor="middle"
      fill="#ffffff"
      fontFamily="Pretendard, sans-serif"
      fontSize="80"
    >
      {lines.map((line, index) => (
        <tspan key={line.map((part) => part.text).join('')} x="725" dy={index === 0 ? 0 : 104}>
          {line.map((part) => (
            <tspan key={part.text} fontWeight={part.bold ? 700 : 400}>
              {part.text}
            </tspan>
          ))}
        </tspan>
      ))}
    </text>
  );
}

function CardShell({ id, children, copy }) {
  return (
    <svg className={styles.opCardSvg} viewBox="0 0 1450 815" aria-hidden="true">
      <defs>
        <clipPath id={`${id}-clip`}>
          <rect width="1450" height="815" rx="53.3" ry="53.3" />
        </clipPath>
        <filter id={`${id}-glow`} x="-30%" y="-40%" width="160%" height="180%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="0" stdDeviation="46" floodColor="#ffffff" floodOpacity="0.95" />
        </filter>
        <filter id={`${id}-inset`} x="-8%" y="-8%" width="116%" height="116%" colorInterpolationFilters="sRGB">
          <feOffset dy="14.3" />
          <feGaussianBlur stdDeviation="4.8" result="blur" />
          <feComposite in="blur" in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="inner" />
          <feFlood floodColor="#ffffff" result="flood" />
          <feComposite in="flood" in2="inner" operator="in" result="light" />
          <feMerge>
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="light" />
          </feMerge>
        </filter>
        <filter id={`${id}-soft`} x="-8%" y="-8%" width="116%" height="116%">
          <feGaussianBlur stdDeviation="7.5" />
        </filter>
        <filter id={`${id}-orb`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5.8" />
        </filter>
      </defs>
      <g filter={`url(#${id}-glow)`}>
        <g clipPath={`url(#${id}-clip)`} filter={`url(#${id}-inset)`}>
          <rect width="1450" height="815" fill="#ffffff" />
          {children}
          <CardCopy lines={copy} />
        </g>
      </g>
    </svg>
  );
}

export function Op10Card1() {
  return (
    <CardShell
      id="op10a"
      copy={[
        [
          { text: '초록 사이로 ', bold: false },
          { text: '선명한 햇살', bold: true },
          { text: '이', bold: false },
        ],
        [{ text: '스며드는 서울', bold: false }],
      ]}
    >
      <g filter="url(#op10a-soft)" opacity="0.9">
        <image
          href="/op/op10-sun.png"
          x="0"
          y="0"
          width="1459"
          height="815"
          preserveAspectRatio="xMidYMax slice"
          transform="translate(729.5 407.5) scale(-1 1) translate(-729.5 -407.5)"
        />
      </g>
      <rect width="1450" height="815" fill="url(#op10a-wash)" />
      <defs>
        <linearGradient id="op10a-wash" x1="0" y1="815" x2="1450" y2="0">
          <stop offset="0%" stopColor="rgb(60,209,255)" stopOpacity="0.28" />
          <stop offset="48%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="rgb(184,255,162)" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <g filter="url(#op10a-orb)">
        <clipPath id="op10a-orb-clip">
          <circle cx="725" cy="290" r="173" />
        </clipPath>
        <image
          href="/op/op10-sun-orb.png"
          x="552"
          y="117"
          width="346"
          height="346"
          clipPath="url(#op10a-orb-clip)"
          preserveAspectRatio="xMidYMid slice"
        />
      </g>
    </CardShell>
  );
}

export function Op10Card2() {
  return (
    <CardShell
      id="op10b"
      copy={[
        [{ text: '탁한 일상을 비우고', bold: false }],
        [
          { text: '맑은 초록으로 채우는', bold: true },
          { text: ' 서울', bold: false },
        ],
      ]}
    >
      <g filter="url(#op10b-soft)" opacity="0.9" transform="rotate(180 821.5 472.5)">
        <image href="/op/card-center-bg.png" x="-21" y="0" width="1685" height="945" preserveAspectRatio="none" />
      </g>
      <rect width="1450" height="815" fill="url(#op10b-wash)" />
      <defs>
        <linearGradient id="op10b-wash" x1="1450" y1="815" x2="0" y2="0">
          <stop offset="0%" stopColor="rgb(60,209,255)" stopOpacity="0.28" />
          <stop offset="46%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="rgb(184,255,162)" stopOpacity="0.4" />
        </linearGradient>
        <clipPath id="op10b-leaf">
          <circle cx="725" cy="290" r="173" />
        </clipPath>
      </defs>
      <g clipPath="url(#op10b-leaf)" style={{ mixBlendMode: 'lighten' }}>
        <image
          href="/op/card-leaf.png"
          x="552"
          y="117"
          width="346"
          height="346"
          preserveAspectRatio="xMidYMid slice"
          transform="translate(725 290) scale(1 -1) rotate(90) translate(-725 -290)"
        />
      </g>
      <g clipPath="url(#op10b-leaf)" style={{ mixBlendMode: 'lighten' }}>
        <image
          href="/op/card-leaf-b.png"
          x="552"
          y="117"
          width="346"
          height="346"
          preserveAspectRatio="xMidYMid slice"
          transform="translate(725 290) scale(1 -1) rotate(-98) translate(-725 -290)"
        />
      </g>
    </CardShell>
  );
}

export function Op10Card3() {
  return (
    <CardShell
      id="op10c"
      copy={[
        [{ text: '지친 걸음을 품어주는', bold: false }],
        [
          { text: '넉넉한 초록 그늘', bold: true },
          { text: '의 서울', bold: false },
        ],
      ]}
    >
      <g filter="url(#op10c-soft)" opacity="0.9">
        <image href="/op/op10-shade.png" x="0" y="0" width="1454" height="815" preserveAspectRatio="xMidYMax slice" />
      </g>
      <rect width="1450" height="815" fill="url(#op10c-wash)" />
      <defs>
        <linearGradient id="op10c-wash" x1="0" y1="815" x2="1450" y2="0">
          <stop offset="0%" stopColor="rgb(60,209,255)" stopOpacity="0.26" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="rgb(223,255,213)" stopOpacity="0.34" />
        </linearGradient>
        <clipPath id="op10c-orb">
          <circle cx="725" cy="290" r="173" />
        </clipPath>
      </defs>
      <g clipPath="url(#op10c-orb)" opacity="0.7" style={{ mixBlendMode: 'plus-lighter' }}>
        <image
          href="/op/op10-shade-orb.png"
          x="520"
          y="90"
          width="420"
          height="400"
          preserveAspectRatio="xMidYMid slice"
        />
      </g>
    </CardShell>
  );
}
