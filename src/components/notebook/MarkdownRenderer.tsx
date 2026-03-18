import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

marked.setOptions({
  breaks: true,
  gfm: true,
});

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const html = useMemo(() => {
    if (!content.trim()) return "";
    const raw = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [content]);

  if (!content.trim()) {
    return (
      <p className="text-sm text-muted-foreground italic px-1">
        Empty markdown cell. Click to edit.
      </p>
    );
  }

  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
