import { useMemo, useState } from 'react';
import { domAnimation, LazyMotion } from 'framer-motion';
import { Apple, Check, Download, Monitor, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Reveal } from '@/components/landing/Reveal';
import { Button, ButtonLink } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { detectBrowser, detectPlatform, type Platform } from '@/lib/platform';

type Guide = 'android' | 'mac' | 'other';

const GUIDES: Record<Guide, { title: string; steps: { browser: string; items: string[] }[] }> = {
  android: {
    title: 'Android',
    steps: [
      {
        browser: 'Chrome',
        items: ['Ouvrez ce site dans Chrome.', 'Touchez le menu ⋮ en haut à droite.', 'Choisissez « Installer l’application » (ou « Ajouter à l’écran d’accueil »).', 'Confirmez : Lumen apparaît dans vos applications.'],
      },
      {
        browser: 'Samsung Internet',
        items: ['Touchez le menu ☰ en bas.', 'Choisissez « Ajouter la page à » → « Écran d’accueil ».'],
      },
    ],
  },
  mac: {
    title: 'Mac',
    steps: [
      {
        browser: 'Safari (macOS Sonoma ou plus récent)',
        items: ['Ouvrez ce site dans Safari.', 'Menu Fichier → « Ajouter au Dock… ».', 'Cliquez sur « Ajouter » : Lumen s’ouvre dans sa propre fenêtre, depuis le Dock ou le Launchpad.'],
      },
      {
        browser: 'Chrome ou Edge',
        items: ['Cliquez sur l’icône d’installation à droite de la barre d’adresse (ou menu ⋮ → « Installer Lumen »).', 'Lumen est ajouté dans le dossier Applications et peut être gardé dans le Dock.'],
      },
    ],
  },
  other: {
    title: 'Autres appareils',
    steps: [
      { browser: 'Windows, Linux, ChromeOS', items: ['Dans Chrome ou Edge, cliquez sur l’icône d’installation dans la barre d’adresse.'] },
      { browser: 'iPhone et iPad (Safari)', items: ['Touchez Partager, puis « Sur l’écran d’accueil ».'] },
    ],
  },
};

function guideFor(p: Platform): Guide {
  return p === 'android' ? 'android' : p === 'mac' ? 'mac' : 'other';
}

export default function Install() {
  const platform = useMemo(() => detectPlatform(), []);
  const browser = useMemo(() => detectBrowser(), []);
  const [guide, setGuide] = useState<Guide>(guideFor(platform));
  const { state, install } = useInstallPrompt();
  const [result, setResult] = useState<string | null>(null);
  const g = GUIDES[guide];

  const hint =
    platform === 'mac' && browser === 'firefox'
      ? 'Firefox ne permet pas d’installer d’application web sur Mac : ouvrez Lumen dans Safari, Chrome ou Edge.'
      : platform === 'android' && browser === 'firefox'
        ? 'Pour la meilleure expérience (voix et mode hors-ligne), installez Lumen depuis Chrome.'
        : null;

  return (
    <LazyMotion features={domAnimation} strict>
      <header className="border-b border-line/50">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link to="/" aria-label="Lumen, accueil">
            <Logo />
          </Link>
          <ButtonLink to="/app" size="sm" variant="secondary" aria-label="Ouvrir Lumen dans le navigateur">
            Ouvrir dans le navigateur
          </ButtonLink>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-3xl px-5 pb-24 pt-14">
        <Reveal>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Installer Lumen</h1>
          <p className="mt-4 max-w-xl text-lg text-muted">Une vraie application sur votre écran d’accueil ou dans votre Dock : fenêtre dédiée, lecture hors-ligne, mises à jour automatiques. Gratuit, sans store.</p>
        </Reveal>

        <Reveal delay={0.05} className="mt-10">
          <section aria-labelledby="quick" className="rounded-3xl border border-line bg-surface/60 p-6 sm:p-8" aria-live="polite">
            <h2 id="quick" className="sr-only">
              Installation rapide
            </h2>
            {state === 'installed' ? (
              <p className="flex items-center gap-3 text-fg">
                <Check className="size-5 text-amber" aria-hidden /> Lumen est déjà installé sur cet appareil.
              </p>
            ) : state === 'available' ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-fg">Votre navigateur peut installer Lumen en un clic.</p>
                <Button size="lg" onClick={async () => setResult((await install()) ? 'Lumen est installé.' : 'Installation annulée.')} aria-label="Installer l’application Lumen">
                  <Download className="size-5" aria-hidden /> Installer Lumen
                </Button>
              </div>
            ) : (
              <p className="text-muted">Suivez les étapes ci-dessous pour votre appareil — cela prend moins d’une minute.</p>
            )}
            {result && <p className="mt-3 text-sm text-muted">{result}</p>}
            {hint && <p className="mt-3 text-sm text-amber">{hint}</p>}
          </section>
        </Reveal>

        <Reveal delay={0.1} className="mt-12">
          <Segmented<Guide>
            label="Choisir votre appareil"
            value={guide}
            onChange={setGuide}
            options={[
              { value: 'android', label: <><Smartphone className="size-4" aria-hidden /> Android</>, ariaLabel: 'Guide Android' },
              { value: 'mac', label: <><Apple className="size-4" aria-hidden /> Mac</>, ariaLabel: 'Guide Mac' },
              { value: 'other', label: <><Monitor className="size-4" aria-hidden /> Autres</>, ariaLabel: 'Guide autres appareils' },
            ]}
          />
          <section aria-label={`Guide ${g.title}`} className="mt-6 space-y-5">
            {g.steps.map((s) => (
              <article key={s.browser} className="rounded-3xl border border-line bg-surface/40 p-6">
                <h2 className="text-lg font-semibold tracking-tight">{s.browser}</h2>
                <ol className="mt-4 space-y-3">
                  {s.items.map((item, i) => (
                    <li key={item} className="flex gap-3 text-muted">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-fg ring-1 ring-line">{i + 1}</span>
                      <span className="pt-0.5">{item}</span>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </section>
        </Reveal>
      </main>
    </LazyMotion>
  );
}
