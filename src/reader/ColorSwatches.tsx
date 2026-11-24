import { HIGHLIGHT_COLORS, type HighlightColor } from '../types';

interface ColorSwatchesProps {
  /** What picking a colour does, for its label: "Highlight in" yellow. */
  action: string;
  current?: HighlightColor;
  onPick: (color: HighlightColor) => void;
}

export function ColorSwatches({ action, current, onPick }: ColorSwatchesProps) {
  return HIGHLIGHT_COLORS.map((color) => (
    <button
      key={color}
      type="button"
      className="swatch"
      data-color={color}
      aria-label={`${action} ${color}`}
      aria-pressed={current && current === color}
      title={color.charAt(0).toUpperCase() + color.slice(1)}
      onClick={() => onPick(color)}
    />
  ));
}
