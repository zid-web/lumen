import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors duration-150 select-none disabled:opacity-50 disabled:pointer-events-none';
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-ink hover:brightness-110 shadow-[0_8px_30px_-12px_rgba(124,92,252,0.6)]',
  secondary: 'bg-surface-2 text-fg border border-line hover:bg-line/70',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-12 px-6 text-base',
  icon: 'h-11 w-11',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string): string {
  return cn(base, variants[variant], sizes[size], className);
}

interface Common {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & Common>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...props} />;
});

export function ButtonLink({ variant = 'primary', size = 'md', className, ...props }: LinkProps & Common) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonAnchor({ variant = 'primary', size = 'md', className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & Common) {
  return <a className={buttonClass(variant, size, className)} {...props} />;
}
