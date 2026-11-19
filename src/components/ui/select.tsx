import { useId, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Select natif stylé : accessible, léger, parfait sur mobile. */
export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
  hideLabel = false,
  icon,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  className?: string;
  hideLabel?: boolean;
  icon?: ReactNode;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'mb-2 block text-sm text-muted'}>
        {label}
      </label>
      <div className="relative">
        {icon && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">{icon}</span>}
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className={cn(
            'h-11 w-full appearance-none rounded-full border border-line bg-ink-2 pr-10 text-sm text-fg hover:border-subtle',
            icon ? 'pl-10' : 'pl-4',
          )}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-ink-2">
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
      </div>
    </div>
  );
}
