import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  ariaLabel?: string;
}

/** Groupe de boutons radio accessible (flèches gauche/droite). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  hideLabel = false,
}: {
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (v: T) => void;
  className?: string;
  hideLabel?: boolean;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (i + delta + options.length) % options.length;
    const opt = options[next];
    if (opt) {
      onChange(opt.value);
      refs.current[next]?.focus();
    }
  };
  return (
    <div className={className}>
      <span id={id} className={hideLabel ? 'sr-only' : 'mb-2 block text-sm text-muted'}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={id} className="inline-flex w-full rounded-full border border-line bg-ink-2 p-1">
        {options.map((o, i) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={o.ariaLabel}
              tabIndex={active ? 0 : -1}
              onKeyDown={(e) => onKey(e, i)}
              onClick={() => onChange(o.value)}
              className={cn(
                'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors',
                active ? 'bg-surface-2 text-fg shadow-inner ring-1 ring-line' : 'text-muted hover:text-fg',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
