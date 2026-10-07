import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const VERTICES = 72;

export default function LightField({ color = 0xf4ffe8, rise = 0.018, sway = 0.0008 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    const positions = new Float32Array(VERTICES * 3);
    const seeds = new Float32Array(VERTICES);
    for (let i = 0; i < VERTICES; i += 1) {
      positions[i * 3] = Math.random() * 2 - 1;
      positions[i * 3 + 1] = Math.random() * 2 - 1;
      positions[i * 3 + 2] = 0;
      seeds[i] = Math.random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color,
      size: 0.012,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: false,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const ratio = 1;
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      const aspect = width / height;
      camera.left = -aspect;
      camera.right = aspect;
      camera.top = 1;
      camera.bottom = -1;
      camera.updateProjectionMatrix();
    };
    resize();

    let frameId = 0;
    let last = 0;
    const render = (now) => {
      frameId = requestAnimationFrame(render);
      if (canvas.clientWidth && Math.abs(canvas.width - canvas.clientWidth) > 2) {
        resize();
      }
      const dt = Math.min((now - (last || now)) / 1000, 0.05);
      last = now;
      const position = geometry.attributes.position;
      for (let i = 0; i < VERTICES; i += 1) {
        const lift = rise * (0.65 + seeds[i]);
        let y = position.getY(i) + lift * dt;
        if (y > 1.05) y = -1.05;
        position.setY(i, y);
        position.setX(i, position.getX(i) + Math.sin(now * 0.001 + seeds[i] * 12) * sway);
      }
      position.needsUpdate = true;
      renderer.render(scene, camera);
    };
    frameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frameId);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [color, rise, sway]);

  return <canvas ref={canvasRef} />;
}
