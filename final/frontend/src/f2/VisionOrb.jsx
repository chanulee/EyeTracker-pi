import { useLayoutEffect, useRef } from 'react';
import visionOrbMarkup from './visionOrbMarkup';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const VIEW_W = 675;
const VIEW_H = 679;
const PAD = 260;
const TEX_W = VIEW_W + PAD * 2;
const TEX_H = VIEW_H + PAD * 2;

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uMap;
uniform vec2 uOrigin;
uniform vec2 uView;
uniform vec2 uTex;
uniform float uAngle;
uniform float uZoom;
uniform vec2 uRipple;
void main() {
  vec2 center = uView * 0.5;
  vec2 p = vUv * uView - center;
  float c = cos(uAngle);
  float s = sin(uAngle);
  vec2 rot = vec2(c * p.x + s * p.y, -s * p.x + c * p.y) * uZoom + center + uRipple;
  gl_FragColor = texture2D(uMap, uOrigin + rot / uTex);
}
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function place(el) {
  el.style.position = 'absolute';
  el.style.left = '0';
  el.style.top = '0';
  el.style.width = `${VIEW_W}px`;
  el.style.height = `${VIEW_H}px`;
  el.style.pointerEvents = 'none';
}

function colorLayerMarkup(group, sourceSvg) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('width', String(TEX_W));
  svg.setAttribute('height', String(TEX_H));
  svg.setAttribute('viewBox', `${-PAD} ${-PAD} ${TEX_W} ${TEX_H}`);
  const filter = sourceSvg.querySelector('#filter2_f_1581_291').cloneNode(true);
  filter.setAttribute('x', '-900');
  filter.setAttribute('y', '-900');
  filter.setAttribute('width', '2200');
  filter.setAttribute('height', '2200');
  const blur = filter.querySelector('feGaussianBlur');
  if (blur) blur.setAttribute('stdDeviation', '58');
  const gradient = sourceSvg.querySelector('#paint1_radial_1581_291').cloneNode(false);
  const mix = (from, to, t) => from.map((channel, index) => Math.round(channel + (to[index] - channel) * t));
  const blue = [11, 180, 254];
  const mint = [100, 248, 194];
  const yellow = [244, 238, 95];
  for (let step = 0; step <= 12; step += 1) {
    const t = step / 12;
    const color = t < 0.5 ? mix(blue, mint, t / 0.5) : mix(mint, yellow, (t - 0.5) / 0.5);
    const stop = document.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', String(t));
    stop.setAttribute('stop-color', `#${color.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`);
    stop.setAttribute('stop-opacity', '1');
    gradient.appendChild(stop);
  }
  const defs = document.createElementNS(SVG_NS, 'defs');
  defs.appendChild(filter);
  defs.appendChild(gradient);
  svg.appendChild(group.cloneNode(true));
  svg.appendChild(defs);
  return new XMLSerializer().serializeToString(svg);
}

function orbLabel(lines) {
  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('x', String(VIEW_W / 2));
  text.setAttribute('y', '336');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('fill', '#414141');
  text.setAttribute('font-family', 'Pretendard, sans-serif');
  text.setAttribute('font-size', '40');
  text.setAttribute('font-weight', '700');
  lines.forEach((line, index) => {
    const row = document.createElementNS(SVG_NS, 'tspan');
    row.setAttribute('x', String(VIEW_W / 2));
    row.setAttribute('dy', index === 0 ? '0' : '67');
    row.textContent = line;
    text.appendChild(row);
  });
  return text;
}

export default function VisionOrb({ className, lines = [], voiceLive = false, voiceMark = 0 }) {
  const hostRef = useRef(null);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const voiceRef = useRef({ mark: 0, seen: 0, aim: 0, level: 0 });
  voiceRef.current.live = voiceLive;
  voiceRef.current.mark = voiceMark;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const doc = new DOMParser().parseFromString(visionOrbMarkup, 'image/svg+xml');
    const svg = doc.documentElement;
    const colorGroup = svg.querySelector('g[filter="url(#filter2_f_1581_291)"]');
    if (!svg || svg.nodeName.toLowerCase() !== 'svg' || !colorGroup) {
      if (svg) host.replaceChildren(document.importNode(svg, true));
      return undefined;
    }

    const markup = colorLayerMarkup(colorGroup, svg);
    const base = document.importNode(svg, true);
    const bakedNow = base.querySelector('path[fill="#414141"]');
    if (bakedNow) bakedNow.remove();
    host.style.position = 'relative';
    host.replaceChildren(base);

    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = VIEW_W * scale;
    canvas.height = VIEW_H * scale;
    place(canvas);
    canvas.style.zIndex = '1';
    canvas.style.clipPath = 'inset(55.93px 56.46px 56.07px 55.93px round 281.31px)';

    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
    });
    const vert = gl && compile(gl, gl.VERTEX_SHADER, VERT);
    const frag = gl && compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!gl || !vert || !frag) return undefined;

    const program = gl.createProgram();
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return undefined;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.viewport(0, 0, canvas.width, canvas.height);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

    const angleLoc = gl.getUniformLocation(program, 'uAngle');
    const rippleLoc = gl.getUniformLocation(program, 'uRipple');
    gl.uniform2f(gl.getUniformLocation(program, 'uOrigin'), PAD / TEX_W, PAD / TEX_H);
    gl.uniform2f(gl.getUniformLocation(program, 'uView'), VIEW_W, VIEW_H);
    gl.uniform2f(gl.getUniformLocation(program, 'uTex'), TEX_W, TEX_H);
    gl.uniform1f(gl.getUniformLocation(program, 'uZoom'), 0.9);

    let frame = 0;
    let stopped = false;
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
    const image = new Image();

    image.onload = () => {
      if (stopped) return;
      const source = document.createElement('canvas');
      source.width = TEX_W * scale;
      source.height = TEX_H * scale;
      source.getContext('2d').drawImage(image, 0, 0, source.width, source.height);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

      const liveColor = base.querySelector('g[filter="url(#filter2_f_1581_291)"]');
      const sheen = base.querySelector('rect[fill="url(#pattern0_1581_291)"]');
      const baked = base.querySelector('path[fill="#414141"]');
      if (baked) baked.remove();
      const label = orbLabel(linesRef.current.length ? linesRef.current : ['지친 걸음을 품어주는', '넉넉한 초록 그늘의 서울']);
      if (liveColor) liveColor.remove();

      const top = document.createElementNS(SVG_NS, 'svg');
      top.setAttribute('xmlns', SVG_NS);
      top.setAttribute('xmlns:xlink', XLINK_NS);
      top.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
      place(top);
      top.style.zIndex = '2';
      const clipWrap = document.createElementNS(SVG_NS, 'g');
      clipWrap.setAttribute('clip-path', 'url(#clipTop)');
      if (sheen) {
        sheen.style.mixBlendMode = '';
        clipWrap.appendChild(sheen);
      }
      if (label) clipWrap.appendChild(label);
      const defs = document.createElementNS(SVG_NS, 'defs');
      const clip = base.querySelector('#clip0_1581_291').cloneNode(true);
      clip.id = 'clipTop';
      const pattern = base.querySelector('#pattern0_1581_291').cloneNode(true);
      pattern.id = 'patternTop';
      const use = pattern.querySelector('use');
      if (use) {
        use.setAttribute('href', '#imageTop');
        use.setAttributeNS(XLINK_NS, 'href', '#imageTop');
      }
      const photo = base.querySelector('#image0_1581_291').cloneNode(true);
      photo.id = 'imageTop';
      if (sheen) sheen.setAttribute('fill', 'url(#patternTop)');
      defs.append(clip, pattern, photo);
      top.append(clipWrap, defs);
      top.style.mixBlendMode = 'plus-lighter';

      const textLayer = document.createElementNS(SVG_NS, 'svg');
      textLayer.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
      place(textLayer);
      textLayer.style.zIndex = '3';
      if (label) {
        const textClip = document.createElementNS(SVG_NS, 'g');
        textClip.setAttribute('clip-path', 'url(#clipText)');
        textClip.appendChild(label);
        const textDefs = document.createElementNS(SVG_NS, 'defs');
        const textClipPath = clip.cloneNode(true);
        textClipPath.id = 'clipText';
        textDefs.appendChild(textClipPath);
        textLayer.append(textClip, textDefs);
      }

      host.append(canvas, top, textLayer);

      const started = performance.now();
      const draw = (now) => {
        if (stopped) return;
        const t = (now - started) / 1000;
        const voice = voiceRef.current;
        if (voice.mark !== voice.seen) {
          voice.seen = voice.mark;
          voice.aim = Math.min(1, voice.aim + 0.45);
        }
        voice.aim += (0 - voice.aim) * 0.006;
        voice.level += (voice.aim - voice.level) * 0.03;
        const swell = 1 + voice.level * 1.35;
        const turn = (Math.PI * 2) / 16;
        const breathe = Math.sin(t * 0.55) * 0.1 + Math.sin(t * 1.05) * (0.045 + voice.level * 0.08);
        gl.uniform1f(angleLoc, t * turn + breathe);
        gl.uniform2f(
          rippleLoc,
          (Math.sin(t * 1.55) * 18 + Math.sin(t * 2.45 + 0.7) * 10) * swell,
          (Math.cos(t * 1.2) * 15 + Math.cos(t * 2.05 + 1.3) * 9) * swell,
        );
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);
    };
    image.src = url;

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      URL.revokeObjectURL(url);
    };
  }, []);

  return <div ref={hostRef} className={className} aria-hidden="true" />;
}
