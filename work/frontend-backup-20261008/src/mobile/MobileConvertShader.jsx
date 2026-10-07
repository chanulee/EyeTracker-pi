import { useEffect, useRef } from 'react';
import styles from './MobileConvertShader.module.css';

const VERT = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform float uIntro;

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = uv;
  p.x *= aspect;

  float t = uTime * 0.22; // 차분하고 우아한 앰비언트 호흡

  // 매우 큰 덩어리의 유기적 파동 (주파수를 대폭 낮춰 경계선 제로화)
  vec2 q = vec2(
    sin(p.x * 0.9 + t * 0.4) + cos(p.y * 0.8 - t * 0.35),
    cos(p.x * 0.7 - t * 0.3) + sin(p.y * 1.0 + t * 0.45)
  ) * 0.25;

  vec2 r = vec2(
    sin(p.x * 0.6 + q.x * 1.5 + t * 0.25),
    cos(p.y * 0.8 + q.y * 1.5 - t * 0.3)
  );

  float n = (r.x + r.y) * 0.25 + 0.5; // 0.0 ~ 1.0 완만한 곡선

  // 피그마 디자인에 맞춘 자연스럽고 은은한 파스텔 자연광 팔레트
  vec3 cWhite = vec3(0.99, 1.0, 0.98);
  vec3 cSoftMint = vec3(0.85, 0.98, 0.80);
  vec3 cLightLime = vec3(0.78, 0.95, 0.72);
  vec3 cAuraAqua = vec3(0.90, 0.99, 0.95);

  // 경계선이 전혀 생기지 않도록 완만한 선형/삼각함수 블렌딩
  vec3 col = mix(cWhite, cSoftMint, smoothstep(0.15, 0.85, n));
  col = mix(col, cLightLime, sin((q.x + q.y) * 1.0 + t * 0.2) * 0.14 + 0.14);
  col = mix(col, cAuraAqua, cos((p.x - p.y) * 1.2 - t * 0.25) * 0.12 + 0.12);

  // 부드러운 전체 반투명도 (은은하게 일렁이도록 알파 0.45 ~ 0.57)
  float a = (0.45 + 0.12 * n) * uIntro;
  gl_FragColor = vec4(col * a, a);
}
`;

function compile(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/** 변환 대기 중 전체 화면 WebGL 배경 — 가로로 흐르는 그라디언트 */
export default function MobileConvertShader({ fading = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false });
    if (!gl) return undefined;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return undefined;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return undefined;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, 'uRes');
    const uTime = gl.getUniformLocation(program, 'uTime');
    const uIntro = gl.getUniformLocation(program, 'uIntro');

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 모바일 GPU 부담 때문에 DPR 상한을 둔다
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const resize = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };

    let raf = 0;
    const start = performance.now();
    const frame = (now) => {
      resize();
      const elapsed = (now - start) / 1000;
      gl.uniform1f(uTime, reduceMotion ? 0 : elapsed);
      gl.uniform1f(uIntro, reduceMotion ? 1 : Math.min(1, elapsed / 1.2));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduceMotion) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`${styles.canvas} ${fading ? styles.canvasFading : ''}`}
      aria-hidden="true"
    />
  );
}
