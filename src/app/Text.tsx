import type { JSX } from 'preact';

/** Markdown-lite: blank lines split paragraphs, **bold** is bold. Everything else is plain text. */
export function Text({ text, class: cls }: { text: string; class?: string }) {
  return (
    <div class={cls}>
      {text.split(/\n{2,}/).map((para) => (
        <p>{inline(para)}</p>
      ))}
    </div>
  );
}

function inline(s: string): (string | JSX.Element)[] {
  return s.split(/(\*\*[^*]+\*\*)/).map((part) => (part.startsWith('**') && part.endsWith('**') ? <strong>{part.slice(2, -2)}</strong> : part));
}
