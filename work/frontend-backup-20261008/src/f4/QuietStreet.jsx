import { useLayoutEffect, useRef, useState } from 'react';
import styles from './PageFour.module.css';

const DEG = Math.PI / 180;
const YAW_SWAY = 7 * DEG;
const SWAY_MS = 18000;

const VERTEX = `
attribute vec2 position;
varying vec2 screenUV;
void main() {
  screenUV = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;
varying vec2 screenUV;
uniform sampler2D panorama;
uniform vec2 viewport;
uniform vec3 view;
const float PI = 3.141592653589793;
void main() {
  float a = viewport.x / viewport.y;
  float t = tan(view.z * 0.5);
  vec2 p = screenUV * 2.0 - 1.0;
  vec3 ray = normalize(vec3(p.x * a * t, p.y * t, 1.0));
  float cp = cos(view.y);
  float sp = sin(view.y);
  ray = vec3(ray.x, cp * ray.y + sp * ray.z, -sp * ray.y + cp * ray.z);
  float cy = cos(view.x);
  float sy = sin(view.x);
  ray = vec3(cy * ray.x + sy * ray.z, ray.y, -sy * ray.x + cy * ray.z);
  vec2 uv = vec2(fract(0.5 + atan(ray.x, ray.z) / (2.0 * PI)),
                 0.5 - asin(clamp(ray.y, -1.0, 1.0)) / PI);
  uv.y += 0.12 * sin(PI * uv.y);
  gl_FragColor = vec4(texture2D(panorama, uv).rgb, 1.0);
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

export default function QuietStreet({ name, still = false, hold = false, onReady }) {
  const canvasRef = useRef(null);
  const onReadyRef = useRef(onReady);
  const stillRef = useRef(still);
  const holdRef = useRef(hold);
  const [shown, setShown] = useState(false);
  const [sharp, setSharp] = useState(false);
  onReadyRef.current = onReady;
  stillRef.current = still;
  holdRef.current = hold;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !name) return undefined;
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
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
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program, 'panorama'), 0);
    const sizeUniform = gl.getUniformLocation(program, 'viewport');
    const viewUniform = gl.getUniformLocation(program, 'view');

    let dead = false;
    let ready = false;
    let frame = 0;
    let swayStart = 0;
    let sharpenTimer = 0;

    let heldSway = 0;

    const draw = (now) => {
      frame = 0;
      if (dead || !ready) return;
      let sway = 0;
      if (holdRef.current) {
        sway = heldSway;
      } else if (stillRef.current) {
        swayStart = 0;
        heldSway = 0;
      } else {
        if (!swayStart) swayStart = now;
        sway = Math.sin(((now - swayStart) / SWAY_MS) * Math.PI * 2) * YAW_SWAY;
        heldSway = sway;
      }
      const ratio = Math.min(window.devicePixelRatio || 1, 4096 / Math.max(canvas.clientWidth, 1), 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const h = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const fov = Math.min(68 * DEG, 2 * Math.atan(Math.tan(52.5 * DEG) / (w / h)));
      gl.viewport(0, 0, w, h);
      gl.uniform2f(sizeUniform, w, h);
      gl.uniform3f(viewUniform, sway, 0, fov);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      frame = requestAnimationFrame(draw);
    };

    const cached = typeof window !== 'undefined' ? window.__districtStreet : null;
    const image = cached?.name === name && cached.image ? cached.image : new Image();
    const reveal = () => {
      if (dead) return;
      let source = image;
      const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
      if (image.width > maxTexture || image.height > maxTexture) {
        const scale = Math.min(maxTexture / image.width, maxTexture / image.height);
        const resized = document.createElement('canvas');
        resized.width = Math.floor(image.width * scale);
        resized.height = Math.floor(image.height * scale);
        const ctx = resized.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, 0, 0, resized.width, resized.height);
        source = resized;
      }
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      ready = true;
      draw(performance.now());
      setShown(true);
      setSharp(false);
      sharpenTimer = window.setTimeout(() => {
        if (!dead) setSharp(true);
      }, 1600);
      onReadyRef.current?.();
    };
    if (image.complete && image.naturalWidth) {
      reveal();
    } else {
      image.addEventListener('load', reveal, { once: true });
      if (!image.getAttribute('src')) {
        image.src = `/api/district-street?name=${encodeURIComponent(name)}&v=2`;
      }
    }

    return () => {
      dead = true;
      if (sharpenTimer) window.clearTimeout(sharpenTimer);
      if (frame) cancelAnimationFrame(frame);
      image.removeEventListener('load', reveal);
    };
  }, [name]);

  return (
    <canvas
      ref={canvasRef}
      className={`${styles.street} ${shown ? styles.streetOn : ''} ${hold ? styles.streetHeld : sharp ? styles.streetSharp : ''}`}
      aria-hidden="true"
    />
  );
}
