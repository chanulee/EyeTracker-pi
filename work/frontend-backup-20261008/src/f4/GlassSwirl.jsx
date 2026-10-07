import { useEffect, useRef } from 'react';
import styles from './PageFour.module.css';

const VERTEX = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uPhase;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float ang = atan(p.y, p.x);
  float t = uTime;
  float spin = t * 0.36 + uPhase;
  float spinSlow = t * 0.13 + uPhase * 0.7 + 2.2;
  float d1 = atan(sin(ang - spin), cos(ang - spin));
  float d2 = atan(sin(ang - spinSlow), cos(ang - spinSlow));
  float warp = sin(ang * 2.0 + r * 3.4 - t * 0.22) * 0.28
             + sin(ang * 3.0 - t * 0.11 + uPhase) * 0.12;
  float lobe = exp(-pow(d1 + warp, 2.0) * 0.72);
  float lobe2 = exp(-pow(d2 - warp * 0.45, 2.0) * 0.38) * 0.58;
  float body = clamp(lobe * 0.92 + lobe2, 0.0, 1.0);
  float radial = smoothstep(0.0, 0.38, r);
  float edge = 1.0 - smoothstep(0.86, 1.0, r);
  float alpha = body * radial * edge;

  vec3 ice = vec3(0.62, 0.90, 1.0);
  vec3 blue = vec3(0.196, 0.678, 1.0);
  vec3 deep = vec3(0.05, 0.42, 0.96);
  vec3 col = mix(ice, blue, smoothstep(0.12, 0.78, body));
  col = mix(col, deep, lobe * 0.42);
  gl_FragColor = vec4(col, alpha * 0.88);
}`;

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

export default function GlassSwirl({ live = false, phase = 0 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
    });
    if (!gl) return undefined;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vertex || !fragment) return undefined;
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return undefined;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const timeLoc = gl.getUniformLocation(program, 'uTime');
    const phaseLoc = gl.getUniformLocation(program, 'uPhase');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const started = performance.now();
    let frame = 0;

    const draw = (now) => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);
      gl.uniform1f(timeLoc, reduceMotion ? 0.4 : (now - started) / 1000);
      gl.uniform1f(phaseLoc, phase);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(frame);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, [phase]);

  return (
    <canvas
      ref={canvasRef}
      className={`${styles.orbSwirl} ${live ? styles.orbSwirlOn : ''}`}
      aria-hidden="true"
    />
  );
}
