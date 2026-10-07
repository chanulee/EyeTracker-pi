// 보정 타깃의 바깥 "번지는 원" 그래픽. (가운데 점/진행 애니메이션은 CSS 로 유지)
// 사용자 제공 피그마 SVG. 한 번에 하나의 타깃만 렌더되므로 내부 id 충돌 걱정은 없다.
export const CALIBRATION_TARGET_SVG = `<svg width="100%" height="100%" viewBox="0 0 198 198" fill="none" xmlns="http://www.w3.org/2000/svg">
<g filter="url(#filter0_dddif_2093_7928)">
<circle cx="98.506" cy="98.5061" r="68.4902" transform="rotate(-13.6634 98.506 98.5061)" fill="url(#paint0_linear_2093_7928)"/>
<circle cx="98.506" cy="98.5061" r="68.4902" transform="rotate(-13.6634 98.506 98.5061)" fill="url(#paint1_linear_2093_7928)"/>
<circle cx="98.506" cy="98.5061" r="68.4902" transform="rotate(-13.6634 98.506 98.5061)" fill="url(#paint2_linear_2093_7928)"/>
</g>
<g filter="url(#filter1_if_2093_7928)">
<circle cx="98.8044" cy="98.6879" r="55.2311" transform="rotate(-13.6634 98.8044 98.6879)" fill="#E3C3CD" fill-opacity="0.3"/>
<circle cx="98.8044" cy="98.6879" r="54.2311" transform="rotate(-13.6634 98.8044 98.6879)" stroke="white" stroke-opacity="0.2" stroke-width="2"/>
</g>
<g filter="url(#filter2_iif_2093_7928)">
<circle cx="97.9452" cy="98.1643" r="45.8581" transform="rotate(18.3881 97.9452 98.1643)" fill="#FFB7DB" fill-opacity="0.1"/>
<circle cx="97.9452" cy="98.1643" r="45.6081" transform="rotate(18.3881 97.9452 98.1643)" stroke="white" stroke-opacity="0.5" stroke-width="0.5"/>
</g>
<g filter="url(#filter3_df_2093_7928)">
<circle cx="98.2754" cy="98.2754" r="8.5" fill="#D9D9D9"/>
<circle cx="98.2754" cy="98.2754" r="8.5" fill="url(#paint3_radial_2093_7928)" fill-opacity="0.4"/>
</g>
<defs>
<filter id="filter0_dddif_2093_7928" x="0" y="0" width="197.012" height="197.012" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset/>
<feGaussianBlur stdDeviation="10"/>
<feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_2093_7928"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset/>
<feGaussianBlur stdDeviation="15"/>
<feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/>
<feBlend mode="normal" in2="effect1_dropShadow_2093_7928" result="effect2_dropShadow_2093_7928"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset/>
<feGaussianBlur stdDeviation="5"/>
<feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/>
<feBlend mode="normal" in2="effect2_dropShadow_2093_7928" result="effect3_dropShadow_2093_7928"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect3_dropShadow_2093_7928" result="shape"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dx="14.5405" dy="14.5405"/>
<feGaussianBlur stdDeviation="7.27025"/>
<feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
<feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 0.94915 0 0 0 0 0.722637 0 0 0 0.4 0"/>
<feBlend mode="normal" in2="shape" result="effect4_innerShadow_2093_7928"/>
<feGaussianBlur stdDeviation="1" result="effect5_foregroundBlur_2093_7928"/>
</filter>
<filter id="filter1_if_2093_7928" x="40.5605" y="40.4434" width="116.488" height="116.488" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dx="-2.9081" dy="-2.9081"/>
<feGaussianBlur stdDeviation="1.45405"/>
<feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
<feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.25 0"/>
<feBlend mode="normal" in2="shape" result="effect1_innerShadow_2093_7928"/>
<feGaussianBlur stdDeviation="1.5" result="effect2_foregroundBlur_2093_7928"/>
</filter>
<filter id="filter2_iif_2093_7928" x="47.0801" y="47.2988" width="101.73" height="101.73" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dx="-5" dy="-5"/>
<feGaussianBlur stdDeviation="2.49707"/>
<feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
<feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.4 0"/>
<feBlend mode="normal" in2="shape" result="effect1_innerShadow_2093_7928"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dx="5" dy="5"/>
<feGaussianBlur stdDeviation="2.49707"/>
<feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
<feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.4 0"/>
<feBlend mode="normal" in2="effect1_innerShadow_2093_7928" result="effect2_innerShadow_2093_7928"/>
<feGaussianBlur stdDeviation="1.5" result="effect3_foregroundBlur_2093_7928"/>
</filter>
<filter id="filter3_df_2093_7928" x="85.7754" y="85.7754" width="25" height="25" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset/>
<feGaussianBlur stdDeviation="2"/>
<feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.25 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_2093_7928"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_2093_7928" result="shape"/>
<feGaussianBlur stdDeviation="1" result="effect2_foregroundBlur_2093_7928"/>
</filter>
<linearGradient id="paint0_linear_2093_7928" x1="120.211" y1="18.4401" x2="30.0157" y2="142.398" gradientUnits="userSpaceOnUse">
<stop stop-color="#B3FFA0"/>
<stop offset="1" stop-color="#63FFFF"/>
</linearGradient>
<linearGradient id="paint1_linear_2093_7928" x1="32.9097" y1="16.5108" x2="134.759" y2="179.12" gradientUnits="userSpaceOnUse">
<stop stop-color="white" stop-opacity="0"/>
<stop offset="0.756398" stop-color="#F4A0FF" stop-opacity="0.765754"/>
<stop offset="1" stop-color="#7649C2"/>
</linearGradient>
<linearGradient id="paint2_linear_2093_7928" x1="116.834" y1="94.6475" x2="129.857" y2="30.0159" gradientUnits="userSpaceOnUse">
<stop stop-color="white" stop-opacity="0"/>
<stop offset="0.860947" stop-color="#FFEE8B" stop-opacity="0.765754"/>
<stop offset="1" stop-color="#FFE926"/>
</linearGradient>
<radialGradient id="paint3_radial_2093_7928" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(105.275 105.775) rotate(9.46232) scale(18.2483)">
<stop stop-color="#F9FFB6"/>
<stop offset="0.0001" stop-color="#46BAB0"/>
<stop offset="0.953723" stop-color="#B13FB7"/>
</radialGradient>
</defs>
</svg>`;
