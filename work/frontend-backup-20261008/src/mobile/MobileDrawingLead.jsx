/**
 * @param {{ lines: import('./mobileDistrictCopy').MobileDistrictCopy['drawingLeadLines'], leadClassName: string, strongClassName: string }} props
 */
export default function MobileDrawingLead({ lines, leadClassName, strongClassName }) {
  return (
    <p className={leadClassName}>
      {lines.map((line, lineIndex) => (
        <span key={lineIndex}>
          {lineIndex > 0 ? <br /> : null}
          {line.parts.map((part, partIndex) =>
            part.strong ? (
              <span key={partIndex} className={strongClassName}>
                {part.text}
              </span>
            ) : (
              <span key={partIndex}>{part.text}</span>
            )
          )}
        </span>
      ))}
    </p>
  );
}
