/**
 * Sélection de voix Gemini (catalogue affiché dans AI Studio, par usage).
 * Sert de liste de départ et de secours si la bibliothèque complète n'est pas joignable.
 */
export interface CatalogVoice {
  name: string;
  description: string;
  pitch: string;
  category: string;
}

const v = (category: string, list: [string, string, string][]): CatalogVoice[] =>
  list.map(([name, description, pitch]) => ({ name, description, pitch, category }));

export const GEMINI_VOICE_CATALOG: CatalogVoice[] = [
  ...v('Conteur', [
    ['Enzo', 'Vif et enthousiaste', 'Grave'],
    ['Riko', 'Assuré et clair', 'Très grave'],
    ['Sami', 'Posé et sûr de lui', 'Grave'],
  ]),
  ...v('Podcast', [
    ['Brio', 'Calme et intime', 'Médium-grave'],
    ['Jori', 'Chaleureux et accessible', 'Médium-grave'],
    ['Rami', 'Chaleureux et accessible', 'Grave'],
  ]),
  ...v('Professionnel', [
    ['Cruz', 'Posé et professionnel', 'Très grave'],
    ['Elio', 'Calme et rassurant', 'Médium'],
    ['Tova', 'Résonnant et apaisant', 'Médium-grave'],
  ]),
  ...v('Tuteur', [
    ['Bodi', 'Calme et intime', 'Grave'],
    ['Lumi', 'Chaleureux et accessible', 'Grave'],
    ['Sola', 'Doux et détendu', 'Très aigu'],
  ]),
  ...v('Voix off', [
    ['Koda', 'Direct et serviable', 'Médium-grave'],
    ['Nika', 'Chaleureux et accessible', 'Médium'],
    ['Tavi', 'Calme et intime', 'Médium-aigu'],
  ]),
  ...v('Pédagogique', [
    ['Kira', 'Posé et sûr de lui', 'Médium'],
    ['Ludo', 'Assuré et clair', 'Grave'],
    ['Mako', 'Énergique et coloré', 'Grave'],
  ]),
  ...v('Assistant', [
    ['Gero', 'Clair et amical', 'Grave'],
    ['Neno', 'Profond et velouté', 'Très grave'],
    ['Olin', 'Léger et précis', 'Grave'],
  ]),
  ...v('Accueil', [
    ['Arlo', 'Assuré et clair', 'Très grave'],
    ['Cleo', 'Chaleureux et engageant', 'Médium-aigu'],
    ['Finn', 'Chaleureux et accessible', 'Grave'],
  ]),
  ...v('Relation client', [
    ['Daro', 'Assuré et clair', 'Grave'],
    ['Fola', 'Clair et amical', 'Médium'],
    ['Hali', 'Calme et rassurant', 'Médium-aigu'],
  ]),
  ...v('Support', [
    ['Enya', 'Direct et professionnel', 'Médium'],
    ['Jett', 'Chaleureux et empathique', 'Très grave'],
    ['Knox', 'Chaleureux et conversationnel', 'Grave'],
  ]),
];
