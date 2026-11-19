import { useId } from 'react';

export function Range({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  const id = useId();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <label htmlFor={id} className="text-muted">
          {label}
        </label>
        <output htmlFor={id} className="font-medium tabular-nums text-fg">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="range w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
