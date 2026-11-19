import { ButtonLink } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-medium text-amber">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Page introuvable</h1>
        <p className="mt-3 text-muted">Cette page n’existe pas ou a été déplacée.</p>
        <ButtonLink to="/" className="mt-8" aria-label="Revenir à l’accueil">
          Revenir à l’accueil
        </ButtonLink>
      </div>
    </main>
  );
}
