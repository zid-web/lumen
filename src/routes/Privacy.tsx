import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link to="/" aria-label="Accueil Lumen">
        <Logo />
      </Link>
      <h1 className="mt-12 text-3xl font-semibold tracking-tight">Confidentialité</h1>
      <div className="mt-8 space-y-5 leading-relaxed text-muted">
        <p>Lumen est conçu pour garder vos lectures chez vous. Vos livres, votre progression et l’audio déjà généré sont stockés uniquement sur votre appareil (IndexedDB). Aucun compte n’est nécessaire.</p>
        <p>
          Lorsque vous écoutez un passage avec une voix premium ou que vous le traduisez, seul le texte du paragraphe concerné est envoyé à notre serveur, qui le transmet au fournisseur configuré
          (Microsoft Azure, ElevenLabs ou DeepL) puis renvoie le résultat. Ces textes ne sont ni conservés ni journalisés par Lumen.
        </p>
        <p>Avec la voix du navigateur, la synthèse est réalisée par votre système d’exploitation et aucun texte ne quitte votre appareil.</p>
        <p>Pour limiter les abus, l’adresse IP est utilisée de façon temporaire pour le contrôle de débit. Aucun cookie publicitaire ni traceur tiers n’est utilisé.</p>
        <p>Vous pouvez effacer toutes vos données à tout moment depuis Réglages → Stockage, ou en supprimant les données du site dans votre navigateur.</p>
      </div>
    </main>
  );
}
