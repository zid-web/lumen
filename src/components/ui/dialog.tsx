import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Dialog modal basé sur <dialog> natif (focus trap, Échap, inert gérés par le navigateur). */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className="m-auto mb-0 w-full max-w-lg rounded-t-3xl border border-line bg-surface p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm sm:mb-auto sm:rounded-3xl"
    >
      <div className="safe-bottom p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
