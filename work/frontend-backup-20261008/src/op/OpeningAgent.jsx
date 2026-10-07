import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import styles from './Opening.module.css';

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = `
precision highp float;
uniform float time;
uniform float motion;
uniform float spin;
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

float blob3(vec3 p, vec3 c, float radius) {
  vec3 d = (p - c) / radius;
  return exp(-dot(d, d));
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float t = time;
  float rad = 0.72;
  float aa = max(fwidth(r) * 1.6, 0.008);
  float mask = 1.0 - smoothstep(rad - 0.008, rad + aa, r);
  float ang = atan(p.y, p.x);
  float pinkWave = 0.5 + 0.5 * sin(ang * 2.0 + t * 0.85);
  float mintWave = 0.5 + 0.5 * sin(ang * 3.0 - t * 0.62 + 1.7);
  float outside = max(r - rad, 0.0);
  float nearGlow = exp(-pow(outside / 0.05, 2.0));
  float farGlow = exp(-pow(outside / 0.18, 2.0));
  float glow = nearGlow * 0.7 + farGlow;
  glow *= 1.0 - smoothstep(0.84, 1.0, r);
  float glowAmt = glow * (0.27 + 0.16 * mintWave);
  float alpha = max(mask, glowAmt);
  if (alpha < 0.004) discard;

  float sway = 0.04 + motion * 0.4;
  float cp = cos(spin);
  float spn = sin(spin);
  vec2 disc = p / rad;
  float z = sqrt(max(0.0, 1.0 - dot(disc, disc)));
  vec3 sp = vec3(disc, z);
  vec3 src = vec3(cp * sp.x + spn * sp.z, sp.y, -spn * sp.x + cp * sp.z);
  vec2 drift = vec2(sin(t * 0.9), cos(t * 0.7)) * motion;
  vec2 warp = vec2(
    fbm(src.xy * 1.45 + vec2(t * 0.85, src.z * 1.4) + drift),
    fbm(src.yz * 1.45 + vec2(-t * 0.7, t * 0.55) + 3.4)
  );
  warp = mix(vec2(0.5), warp, 0.62);
  vec2 q = src.xy + (warp - 0.5) * sway;

  vec2 gradOrigin = vec2(0.55 * sin(t * 0.8) * motion, 0.2 + 0.38 * cos(t * 0.62) * motion);
  float g = clamp(length(q - gradOrigin) / 1.85, 0.0, 1.0);
  vec3 blue = vec3(0.0667, 0.6706, 0.9922);
  vec3 mint = vec3(0.4706, 0.9608, 0.7804);
  vec3 yellow = vec3(0.9333, 0.9176, 0.4353);
  vec3 col = mix(blue, mint, smoothstep(0.0, 0.82, g));
  col = mix(col, yellow, smoothstep(0.16, 1.0, g));

  float warm = blob3(src, vec3(0.32, 0.18, 0.5), 0.95);
  float pink = blob3(src, vec3(-0.3, -0.22, 0.16), 0.86);
  float mintBand = blob3(src, vec3(0.04, -0.06, -0.46), 1.0);
  float cyan = blob3(src, vec3(-0.04, 0.4, -0.1), 0.8);
  float stir = 0.35 + motion * 0.65;
  col = mix(col, vec3(1.0, 0.66, 0.28), warm * 0.4 * stir);
  col = mix(col, vec3(0.79, 0.65, 1.0), pink * 0.36 * stir);
  col = mix(col, vec3(0.78, 1.0, 0.84), mintBand * 0.26 * stir);
  col = mix(col, vec3(0.62, 1.0, 0.99), cyan * 0.36 * stir);

  float sheen = pow(max(0.0, 1.0 - length((disc - vec2(-0.16, 0.32)) * vec2(1.1, 1.3))), 2.4);
  col = mix(col, vec3(1.0), sheen * 0.1);

  vec3 pinkGlow = vec3(1.0, 0.74, 0.84);
  vec3 mintGlow = vec3(0.72, 1.0, 0.9);
  vec3 glowCol = mix(pinkGlow, mintGlow, pinkWave);
  glowCol = mix(glowCol, vec3(1.0, 0.96, 0.97), 0.42);
  float rim = exp(-pow((r - rad) / 0.035, 2.0));
  vec3 outCol = mix(glowCol, col, clamp(mask, 0.0, 1.0));
  outCol += glowCol * rim * 0.3;
  gl_FragColor = vec4(clamp(outCol, 0.0, 1.0), clamp(alpha, 0.0, 1.0));
}
`;

export default function OpeningAgent({ speaking }) {
  const canvasRef = useRef(null);
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    });
    renderer.setClearColor(0xffffff, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    const uniforms = {
      time: { value: 0 },
      motion: { value: 0 },
      spin: { value: 0 },
    };
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    );
    scene.add(mesh);

    let frameId = 0;
    let last = 0;
    let spin = 0;
    let motion = 0;

    const resize = () => {
      const size = canvas.clientWidth;
      if (!size) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      renderer.setPixelRatio(ratio);
      renderer.setSize(size, size, false);
    };
    resize();

    const render = (now) => {
      frameId = requestAnimationFrame(render);
      const size = canvas.clientWidth;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      if (size && Math.abs(canvas.width - size * ratio) > 2) resize();
      const dt = Math.min((now - (last || now)) / 1000, 0.05);
      last = now;
      const talking = speakingRef.current ? 1 : 0;
      motion += ((talking ? 1 : 0) - motion) * 0.08;
      spin += dt * (0.045 + motion * 0.05);
      uniforms.spin.value = spin;
      uniforms.motion.value = motion;
      uniforms.time.value += dt * (0.2 + motion * 2.4);
      renderer.render(scene, camera);
    };
    frameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frameId);
      mesh.geometry.dispose();
      mesh.material.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.agentCanvas} />;
}
