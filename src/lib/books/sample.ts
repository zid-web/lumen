import type { Book, Chapter } from '../db';

function book(id: string, title: string, author: string, lang: Book['lang'], hue: number, chapters: Chapter[], addedAt: number): Book {
  return {
    id,
    title,
    author,
    lang,
    source: 'sample',
    chapters,
    chapterCount: chapters.length,
    paragraphCount: chapters.reduce((n, c) => n + c.paragraphs.length, 0),
    addedAt,
    hue,
  };
}

/** Contenus originaux livrés avec l'app pour une première écoute immédiate. */
export function sampleBooks(): Book[] {
  const now = Date.now();
  return [
    book('sample-guide-fr', 'Bienvenue dans Lumen', 'L’équipe Lumen', 'fr', 32, [
      {
        title: 'Écouter',
        paragraphs: [
          'Bienvenue dans Lumen. Ce petit guide se lit à voix haute : appuyez sur le bouton de lecture en bas de l’écran, puis laissez-vous porter.',
          'Touchez n’importe quel paragraphe pour reprendre la lecture à cet endroit précis. Le mot prononcé s’illumine, et la page défile toute seule pour vous suivre.',
          'Dans les réglages de voix, choisissez une voix d’homme ou de femme, ajustez la vitesse de trois quarts à deux fois, et la hauteur selon votre confort.',
          'Vous pouvez éteindre l’écran : la lecture continue, et les commandes restent disponibles sur l’écran verrouillé ou dans vos écouteurs.',
        ],
      },
      {
        title: 'Traduire et emporter',
        paragraphs: [
          'Activez la traduction pour lire et écouter un livre dans votre langue. Le texte original reste accessible d’un simple geste.',
          'Chaque chapitre déjà écouté est conservé sur votre appareil. Dans le train ou en avion, il se rejoue sans connexion.',
          'Importez vos propres fichiers EPUB ou texte depuis la bibliothèque, ou collez simplement un article que vous voulez écouter plus tard.',
          'Bonne lecture, et bonne écoute.',
        ],
      },
    ], now),
    book('sample-lighthouse-en', 'The Lighthouse at Sel Point', 'Lumen Originals', 'en', 258, [
      {
        title: 'Chapter One',
        paragraphs: [
          'Every evening at a quarter past six, Ada climbed the hundred and twelve steps of the lighthouse at Sel Point, counting them aloud the way her grandmother had taught her.',
          'The lamp did not need her anymore. It had been automatic for years, turning on with the dusk and off with the dawn, patient as a heartbeat. But Ada climbed anyway, because someone ought to watch the sea.',
          'That night the fog came in low and silver, swallowing the harbour lights one by one. Far out, where the water turned black, a small green light blinked twice, then went dark.',
          'Ada held her breath and waited. The green light blinked again: twice, a pause, then three times. It was not a boat. Boats did not speak in rhythm.',
        ],
      },
      {
        title: 'Chapter Two',
        paragraphs: [
          'By morning the fog had lifted, leaving the rocks wet and shining. On the lowest step of the lighthouse, someone had left a glass bottle, its cork sealed with green wax.',
          'Inside was a single sheet of paper, folded into eight. The handwriting was careful and old-fashioned, and it began with her name.',
          '“Dear Ada,” it read. “If you are reading this, the light has done its work. Keep counting the steps. We are closer than you think.”',
        ],
      },
    ], now - 1),
  ];
}
