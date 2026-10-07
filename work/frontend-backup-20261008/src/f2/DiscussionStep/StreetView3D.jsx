import { useEffect, useRef } from 'react';

let gazeInputOverride = null;

export function setGazeInput(x, y) {
  gazeInputOverride = { x, y };
}

export function clearGazeInput() {
  gazeInputOverride = null;
}

export default function StreetView3D({
  gazePosition,
  className,
  style,
}) {
  const gazePositionRef = useRef(gazePosition);
  gazePositionRef.current = gazePosition;

  useEffect(() => {
    gazeInputOverride = gazePosition
      ? { x: gazePosition.x, y: gazePosition.y }
      : null;
  }, [gazePosition]);

  return (
    <iframe
      className={className}
      src="about:blank"
      allow="fullscreen"
      referrerPolicy="no-referrer"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        border: 0,
        ...style,
      }}
    />
  );
}
