import { memo } from 'react';

/** Rend un texte avec le mot en cours surligné (offsets en caractères). */
export const HighlightedText = memo(function HighlightedText({ text, word }: { text: string; word: { start: number; length: number } | null }) {
  if (!word || word.length <= 0 || word.start >= text.length) return <>{text}</>;
  const end = Math.min(text.length, word.start + word.length);
  return (
    <>
      {text.slice(0, word.start)}
      <mark className="word-active bg-transparent">{text.slice(word.start, end)}</mark>
      {text.slice(end)}
    </>
  );
});
