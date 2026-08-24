import type { ReactNode } from "react";

// Deliberately minimal - just enough markdown to render this project's own
// README (headings, fenced code blocks, bullet/numbered lists, bold, inline
// code, bare links) without pulling in a full markdown-parser dependency.
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s)]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={`${keyPrefix}-${i++}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      parts.push(
        <code className="md-inline-code" key={`${keyPrefix}-${i++}`}>
          {token.slice(1, -1)}
        </code>
      );
    } else {
      parts.push(
        <a href={token} target="_blank" rel="noreferrer" key={`${keyPrefix}-${i++}`}>
          {token}
        </a>
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export function renderMarkdown(markdown: string): ReactNode {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];
  let codeBuffer: string[] = [];
  let inCode = false;
  let key = 0;

  function flushList() {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul className="md-list" key={`list-${key++}`}>
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item, `li-${key}-${i}`)}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  }

  for (const rawLine of lines) {
    const line = rawLine;

    if (line.trim().startsWith("```")) {
      if (inCode) {
        blocks.push(
          <pre className="md-code-block" key={`code-${key++}`}>
            <code>{codeBuffer.join("\n")}</code>
          </pre>
        );
        codeBuffer = [];
        inCode = false;
      } else {
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const text = heading[2];
      const cls = `md-h${level}`;
      blocks.push(
        <div className={cls} key={`h-${key++}`}>
          {renderInline(text, `h-${key}`)}
        </div>
      );
      continue;
    }

    const listItem = line.match(/^\s*[-*]\s+(.*)$/) || line.match(/^\s*\d+\.\s+(.*)$/);
    if (listItem) {
      listBuffer.push(listItem[1]);
      continue;
    }

    if (line.trim() === "") {
      flushList();
      continue;
    }

    flushList();
    blocks.push(
      <p className="md-p" key={`p-${key++}`}>
        {renderInline(line, `p-${key}`)}
      </p>
    );
  }
  flushList();
  if (inCode && codeBuffer.length) {
    blocks.push(
      <pre className="md-code-block" key={`code-${key++}`}>
        <code>{codeBuffer.join("\n")}</code>
      </pre>
    );
  }

  return <>{blocks}</>;
}
