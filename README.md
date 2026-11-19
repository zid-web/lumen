# Lumen — Vos livres. À voix haute. Dans votre langue.

PWA de lecture immersive : synthèse vocale (voix homme / femme), traduction instantanée, bibliothèque hors-ligne.

## Stack
- **Front** : React 18 + TypeScript strict (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vite 7, Tailwind 4, Zustand (+ persist → IndexedDB via `idb`), React Router 6 (routes lazy), TanStack Query, framer-motion (`LazyMotion`), lucide-react, Epub.js (chargé à la demande), vite-plugin-pwa (Workbox).
- **Backend** : Vercel Functions Node 20 dans `/api` (signature Web `Request → Response`), Zod partagé (`shared/contracts.ts`).

## Démarrer
```bash
npm install
cp .env.example .env   # optionnel : sans clé, l'app utilise Web Speech
npm run dev            # sert aussi /api/* (middleware Vite, pas besoin de `vercel dev`)
npm test               # 24 tests (contrats, API, CORS, rate limit, voix, découpage, import)
npm run build          # typecheck front + API, puis build PWA
```

## Architecture TTS
| Couche | Fichier |
|---|---|
| Interface `TtsProvider` / `TtsSynthesisRequest` / `TtsSynthesisResult` | `src/lib/tts/types.ts` |
| `WebSpeechTtsProvider` (fallback, heuristique homme/femme) | `src/lib/tts/webspeech.ts`, `voices.ts` |
| `CloudTtsProvider` (Azure / ElevenLabs via `/api/tts`, cache IndexedDB) | `src/lib/tts/cloud.ts` |
| Contrôleur : file de paragraphes, préchargement, surlignage mot à mot, MediaSession, `<audio>` de secours, bascule auto Web Speech | `src/lib/tts/controller.ts` |
| Providers serveur `AzureTtsProvider` (SDK Speech, word boundaries), `ElevenLabsTtsProvider` (with-timestamps) | `api/_lib/providers/` |
| Traduction `DeeplTranslationProvider`, `AzureTranslatorProvider`, Noop | `api/_lib/providers/` |

Clé de cache audio = SHA-256(provider + langue + voix + vitesse + hauteur + texte).
Chaîne de secours : provider choisi → autre provider configuré → 503 → Web Speech côté client (2 échecs ⇒ Web Speech pour la session, réinitialisé au retour en ligne).

## Sécurité API
Validation Zod, corps ≤ 64 Ko et texte ≤ 5000 caractères, CORS limité à `ALLOWED_ORIGINS` (+ same-origin, + localhost hors prod), rate limit par IP (Upstash si configuré, sinon fenêtre glissante mémoire), clés uniquement en variables d'env, en-têtes de sécurité + CSP dans `vercel.json`.

## Déploiement Vercel
1. Importer le dépôt dans Vercel (framework : Vite, détecté via `vercel.json`).
2. Renseigner les variables de `.env.example` (au minimum `TTS_PROVIDER`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `TRANSLATION_PROVIDER`, `DEEPL_API_KEY`, `ALLOWED_ORIGINS`).
3. Vérifier `GET /api/health`.

À personnaliser : `GITHUB_URL` et `CONTACT` dans `src/routes/Landing.tsx`.
