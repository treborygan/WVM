import "./editor.css";

const zoomLevels = [0.25, 1, 4] as const;

export function ViewportControls({ zoom, onZoomChange }: { readonly zoom: number; readonly onZoomChange: (zoom: number) => void }) {
  return <div className="viewport-controls" role="group" aria-label="Artboard zoom">
    {zoomLevels.map((level) => <button key={level} type="button" className="button button-secondary" aria-pressed={zoom === level} onClick={() => onZoomChange(level)}>
      {Math.round(level * 100)}%
    </button>)}
    <output aria-live="polite">{Math.round(zoom * 100)}% zoom</output>
  </div>;
}
