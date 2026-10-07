import { useCallback, useEffect, useRef, useState } from 'react';

function strokePath(ctx, stroke) {
  if (stroke.points.length < 2) return;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i += 1) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }
  ctx.stroke();
}

export function usePlantDrawing(canvasRef, color) {
  const drawingRef = useRef(false);
  const strokesRef = useRef([]);
  const currentStrokeRef = useRef(null);
  const logicalSizeRef = useRef({ w: 0, h: 0 });

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const { w, h } = logicalSizeRef.current;
    const clearW = w > 0 ? w : canvas.clientWidth;
    const clearH = h > 0 ? h : canvas.clientHeight;
    ctx.clearRect(0, 0, clearW, clearH);

    strokesRef.current.forEach((stroke) => strokePath(ctx, stroke));
    if (currentStrokeRef.current) {
      strokePath(ctx, currentStrokeRef.current);
    }
  }, [canvasRef]);

  const pointerPos = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const logicalW = canvas.clientWidth;
    const logicalH = canvas.clientHeight;
    return {
      x: ((event.clientX - rect.left) / rect.width) * logicalW,
      y: ((event.clientY - rect.top) / rect.height) * logicalH,
    };
  }, [canvasRef]);

  const onPointerDown = useCallback(
    (event) => {
      event.preventDefault();
      const point = pointerPos(event);
      if (!point) return;
      drawingRef.current = true;
      currentStrokeRef.current = {
        color,
        width: 5,
        points: [point],
      };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* ignore invalid pointer id */
      }
    },
    [color, pointerPos]
  );

  const onPointerMove = useCallback(
    (event) => {
      if (!drawingRef.current || !currentStrokeRef.current) return;
      const point = pointerPos(event);
      if (!point) return;
      currentStrokeRef.current.points.push(point);
      if (currentStrokeRef.current.points.length >= 2) {
        setHasDrawing(true);
      }
      redraw();
    },
    [pointerPos, redraw]
  );

  const [hasDrawing, setHasDrawing] = useState(false);

  const updateHasDrawing = useCallback(() => {
    const strokeCommitted = strokesRef.current.some((stroke) => stroke.points.length >= 2);
    const strokeInProgress = (currentStrokeRef.current?.points.length ?? 0) >= 2;
    setHasDrawing(strokeCommitted || strokeInProgress);
  }, []);

  const onPointerUp = useCallback(() => {
    if (!drawingRef.current || !currentStrokeRef.current) return;
    drawingRef.current = false;
    if (currentStrokeRef.current.points.length > 1) {
      strokesRef.current.push(currentStrokeRef.current);
    }
    currentStrokeRef.current = null;
    redraw();
    updateHasDrawing();
  }, [redraw, updateHasDrawing]);

  const undo = useCallback(() => {
    strokesRef.current.pop();
    redraw();
    updateHasDrawing();
  }, [redraw, updateHasDrawing]);

  useEffect(() => {
    redraw();
  }, [color, redraw]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (!w || !h) return;

    logicalSizeRef.current = { w, h };
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }, [canvasRef, redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return undefined;

    resizeCanvas();

    const observer = new ResizeObserver(() => {
      resizeCanvas();
    });
    observer.observe(parent);

    window.addEventListener('resize', resizeCanvas);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [canvasRef, resizeCanvas]);

  const getExportDataUrl = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    try {
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }, [canvasRef]);

  return { onPointerDown, onPointerMove, onPointerUp, undo, getExportDataUrl, hasDrawing };
}
