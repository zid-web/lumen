import { useState } from 'react';
import { domAnimation, LazyMotion } from 'framer-motion';
import { ArrowRight, BookOpen, Check, Download, Languages, Smartphone, Volume2, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Reveal } from '@/components/landing/Reveal';
import { VoiceDemo } from '@/components/landing/VoiceDemo';
import { Button, ButtonAnchor, ButtonLink } from '@/components/ui/button';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

const BADGES = [
  { icon: Smartphone, label: 'PWA installable' },
  { icon: WifiOff, label: 'Fonctionne hors-ligne' },
  { icon: Volume2, label: 'Voix homme & femme' },
  { icon: Languages, label: '12+ langues' },
];


function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/50 bg-ink/80 backdrop-blur-md">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2">
        Aller au contenu
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link to="/" aria-label="Lumen, accueil">
          <Logo />
        </Link>
        <nav aria-label="Navigation principale" className="flex items-center gap-1 sm:gap-2">
          <a href="#demo" className="hidden rounded-full px-4 py-2 text-sm text-muted hover:text-fg sm:inline-block">
            Démo
          </a>
          <a href="#fonctionnalites" className="hidden rounded-full px-4 py-2 text-sm text-muted hover:text-fg sm:inline-block">
            Fonctionnalités
          </a>
          <Link to="/installer" className="hidden rounded-full px-4 py-2 text-sm text-muted hover:text-fg sm:inline-block">
            Installer
          </Link>
          <ButtonLink to="/app" size="sm" aria-label="Ouvrir l’application Lumen">
            Ouvrir l’app
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}

/** Aperçu vectoriel du lecteur (aucune image bitmap → LCP rapide). */
function PlayerPreview() {
  const bars = [6, 12, 20, 14, 26, 18, 10, 22, 30, 16, 8, 24, 12, 20, 28, 14, 9, 18, 24, 12];
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-6 rounded-[40px] bg-accent opacity-[0.12] blur-3xl" />
      <div className="relative rounded-[28px] border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-center justify-between text-xs text-subtle">
          <span>Chapitre 3 · Le phare</span>
          <span className="rounded-full border border-line px-2 py-0.5">FR → EN</span>
        </div>
        <p className="mt-5 text-[15px] leading-relaxed text-muted">
          Every evening, Ada climbed the steps of the lighthouse, <span className="word-active">counting</span> them aloud the way her grandmother had taught her.
        </p>
        <div className="mt-6 flex h-10 items-end gap-1">
          {bars.map((h, i) => (
            <span key={i} className={i < 9 ? 'w-full rounded-full bg-accent' : 'w-full rounded-full bg-line'} style={{ height: `${h + 6}px` }} />
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between">
          <span className="text-xs text-subtle">Voix femme · 1,25×</span>
          <span className="grid size-12 place-items-center rounded-full bg-accent text-ink">
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[480px] max-w-4xl rounded-full bg-violet/20 blur-[120px]" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-16 sm:px-8 md:grid-cols-[1.1fr_1fr] md:pb-28 md:pt-24">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-3 py-1 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-amber" /> Lecteur audio pour vos livres et articles
          </p>
          <h1 className="mt-6 text-[2.6rem] font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Vos livres.
            <br />
            À voix haute.
            <br />
            <span className="text-gradient">Dans votre langue.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
            Lumen lit n’importe quel EPUB ou texte avec une voix naturelle, homme ou femme, et le traduit instantanément — même hors-ligne.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <ButtonLink to="/app" size="lg" aria-label="Ouvrir l’application Lumen">
              Ouvrir l’app <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <ButtonAnchor href="#demo" variant="secondary" size="lg" aria-label="Voir la démo audio interactive">
              <Volume2 className="size-4" aria-hidden /> Voir la démo
            </ButtonAnchor>
          </div>
          <ul className="mt-10 flex flex-wrap gap-x-5 gap-y-3" aria-label="Points clés">
            {BADGES.map(({ icon: Icon, label }) => (
              <li key={label} className="inline-flex items-center gap-2 text-sm text-muted">
                <Icon className="size-4 text-amber" aria-hidden /> {label}
              </li>
            ))}
          </ul>
        </div>
        <PlayerPreview />
      </div>
    </section>
  );
}

function Feature({
  id,
  icon: Icon,
  eyebrow,
  title,
  text,
  points,
}: {
  id?: string;
  icon: typeof BookOpen;
  eyebrow: string;
  title: string;
  text: string;
  points: string[];
}) {
  return (
    <Reveal>
      <article id={id} className="h-full rounded-3xl border border-line bg-surface/50 p-7 transition-colors hover:border-subtle/60 sm:p-8">
        <span className="grid size-11 place-items-center rounded-2xl bg-surface-2 text-amber ring-1 ring-line">
          <Icon className="size-5" aria-hidden />
        </span>
        <p className="mt-6 text-xs font-medium uppercase tracking-[0.14em] text-subtle">{eyebrow}</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-3 leading-relaxed text-muted">{text}</p>
        <ul className="mt-5 space-y-2">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-sm text-muted">
              <Check className="mt-0.5 size-4 shrink-0 text-violet-soft" aria-hidden /> {p}
            </li>
          ))}
        </ul>
      </article>
    </Reveal>
  );
}

function InstallCard() {
  const { state, install } = useInstallPrompt();
  const [result, setResult] = useState<string | null>(null);
  return (
    <Reveal>
      <article className="flex h-full flex-col rounded-3xl border border-line bg-gradient-to-br from-surface to-ink-2 p-7 sm:p-8">
        <span className="grid size-11 place-items-center rounded-2xl bg-surface-2 text-amber ring-1 ring-line">
          <Download className="size-5" aria-hidden />
        </span>
        <p className="mt-6 text-xs font-medium uppercase tracking-[0.14em] text-subtle">Installer</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight">Une vraie app, sans store</h3>
        <p className="mt-3 leading-relaxed text-muted">Installez Lumen sur votre écran d’accueil : lancement instantané, plein écran, commandes sur l’écran verrouillé.</p>
        <div className="mt-auto pt-7" aria-live="polite">
          {state === 'available' && (
            <Button onClick={async () => setResult((await install()) ? 'Lumen est installé.' : 'Installation annulée.')} aria-label="Installer l’application Lumen">
              <Download className="size-4" aria-hidden /> Installer Lumen
            </Button>
          )}
          {state === 'installed' && (
            <p className="inline-flex items-center gap-2 text-sm text-fg">
              <Check className="size-4 text-amber" aria-hidden /> Lumen est installé sur cet appareil.
            </p>
          )}
          {state !== 'installed' && state !== 'available' && (
            <ButtonLink to="/installer" variant="secondary" aria-label="Voir comment installer Lumen sur Android ou Mac">
              <Download className="size-4" aria-hidden /> Installer sur Android ou Mac
            </ButtonLink>
          )}
          {result && <p className="mt-3 text-sm text-muted">{result}</p>}
        </div>
      </article>
    </Reveal>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 text-sm text-subtle sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-4">
          <Logo />
          <span>© {new Date().getFullYear()} · Licence MIT</span>
        </div>
        <nav aria-label="Liens de pied de page" className="flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/privacy" className="hover:text-fg">
            Confidentialité
          </Link>
          <Link to="/installer" className="hover:text-fg">
            Installer
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <LazyMotion features={domAnimation} strict>
      <Header />
      <main id="main">
        <Hero />

        <section id="demo" aria-labelledby="demo-title" className="scroll-mt-16 py-20 md:py-28">
          <div className="mx-auto max-w-3xl px-5 sm:px-8">
            <Reveal>
              <h2 id="demo-title" className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
                Écoutez la différence.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-center text-muted">Choisissez une voix et une langue, puis lancez la lecture. Chaque mot s’illumine au moment où il est prononcé.</p>
            </Reveal>
            <Reveal delay={0.1} className="mt-10">
              <VoiceDemo />
            </Reveal>
          </div>
        </section>

        <section id="fonctionnalites" aria-labelledby="features-title" className="scroll-mt-16 py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <Reveal>
              <h2 id="features-title" className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
                Tout ce qu’il faut pour lire avec les oreilles.
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-5 md:grid-cols-2">
              <Feature
                icon={Volume2}
                eyebrow="Lecteur à voix haute"
                title="Une voix naturelle, à votre rythme"
                text="Voix neuronales homme ou femme, vitesse de 0,75× à 2×, reprise exacte là où vous vous êtes arrêté."
                points={['Touchez un paragraphe pour y sauter', 'Surlignage mot à mot et défilement auto', 'Continue écran éteint']}
              />
              <Feature
                icon={Languages}
                eyebrow="Traduction instantanée"
                title="Lisez dans votre langue"
                text="Un livre en anglais ? Lumen le traduit chapitre par chapitre et le lit dans votre langue, avec l’original à portée de main."
                points={['Traduction DeepL ou Azure', '12 langues de lecture', 'Original et traduction côte à côte']}
              />
              <Feature
                icon={WifiOff}
                eyebrow="Bibliothèque hors-ligne"
                title="Vos livres vous suivent partout"
                text="EPUB, texte, articles collés : tout reste sur votre appareil. L’audio déjà écouté se rejoue sans réseau."
                points={['Aucun compte requis', 'Cache audio local intelligent', 'Vos données ne quittent pas l’appareil']}
              />
              <InstallCard />
            </div>
          </div>
        </section>

        <section aria-labelledby="cta-title" className="pb-24 md:pb-32">
          <Reveal className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-line bg-surface/60 p-8 sm:flex-row sm:items-center sm:p-10">
              <h2 id="cta-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Votre prochain livre vous attend.
              </h2>
              <ButtonLink to="/app" size="lg" aria-label="Commencer à écouter dans Lumen">
                Commencer à écouter <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
            </div>
          </Reveal>
        </section>
      </main>
      <Footer />
    </LazyMotion>
  );
}
