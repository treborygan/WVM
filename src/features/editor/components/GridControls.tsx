import "./editor.css";

export function GridControls({ snapToGrid, gridStepMm, showGrid, onSnapChange, onStepChange, onShowChange }: {
  readonly snapToGrid: boolean;
  readonly gridStepMm: number;
  readonly showGrid: boolean;
  readonly onSnapChange: (enabled: boolean) => void;
  readonly onStepChange: (stepMm: number) => void;
  readonly onShowChange: (visible: boolean) => void;
}) {
  return <div className="grid-controls" aria-label="Grid preferences">
    <label><input type="checkbox" checked={snapToGrid} onChange={(event) => onSnapChange(event.target.checked)} />Snap to grid</label>
    <label>Grid step (mm)<select aria-label="Grid step (mm)" value={gridStepMm} onChange={(event) => onStepChange(Number(event.target.value))}>
      <option value={1}>1 mm</option><option value={5}>5 mm</option><option value={10}>10 mm</option>
    </select></label>
    <label><input type="checkbox" checked={showGrid} onChange={(event) => onShowChange(event.target.checked)} />Show grid</label>
  </div>;
}
