import React from 'react';

/** Tiny Markdown renderer for the resume preview: headings, bullets, bold, paragraphs. No HTML passthrough. */
function inline(text: string, key: number): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <React.Fragment key={key}>
      {parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p))}
    </React.Fragment>
  );
}

export function Markdown({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`ul${out.length}`}>{list}</ul>);
    list = [];
  };
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    const li = line.match(/^\s*[-*•]\s+(.*)$/);
    if (li) { list.push(<li key={i}>{inline(li[1], i)}</li>); return; }
    flush();
    if (!line.trim()) return;
    if (line.startsWith('### ')) out.push(<h3 key={i}>{inline(line.slice(4), i)}</h3>);
    else if (line.startsWith('## ')) out.push(<h2 key={i}>{inline(line.slice(3), i)}</h2>);
    else if (line.startsWith('# ')) out.push(<h1 key={i}>{inline(line.slice(2), i)}</h1>);
    else out.push(<p key={i}>{inline(line, i)}</p>);
  });
  flush();
  return <>{out}</>;
}
