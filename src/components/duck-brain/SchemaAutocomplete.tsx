import React, { useEffect, useRef } from "react";
import { Table2, Columns3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SchemaSuggestion } from "@/lib/duckBrain/schemaSuggestions";

export type { SchemaSuggestion };

interface SchemaAutocompleteProps {
  isOpen: boolean;
  suggestions: SchemaSuggestion[];
  activeIndex: number;
  onSelect: (suggestion: SchemaSuggestion) => void;
  position: { top: number; left: number };
  className?: string;
}

const SchemaAutocomplete: React.FC<SchemaAutocompleteProps> = ({
  isOpen,
  suggestions,
  activeIndex,
  onSelect,
  position,
  className,
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current && activeIndex >= 0) {
      const activeItem = listRef.current.children[activeIndex] as HTMLElement;
      activeItem?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  if (!isOpen || suggestions.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute z-50 w-64 max-h-48 overflow-auto",
        "bg-popover border rounded-md shadow-lg",
        className
      )}
      style={{ bottom: position.top, left: position.left }}
    >
      <div ref={listRef} className="py-1">
        {suggestions.map((suggestion, index) => (
          <button
            key={`${suggestion.type}-${suggestion.fullPath}`}
            type="button"
            onClick={() => onSelect(suggestion)}
            className={cn(
              "w-full px-3 py-1.5 text-left text-sm flex items-center gap-2",
              "hover:bg-accent",
              index === activeIndex && "bg-accent"
            )}
          >
            {suggestion.type === "table" ? (
              <Table2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            ) : (
              <Columns3 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <span className="font-medium truncate block">{suggestion.name}</span>
              {suggestion.type === "table" && (
                <span className="text-[10px] text-muted-foreground">
                  {suggestion.rowCount ? `${suggestion.rowCount.toLocaleString()} rows` : "table"}
                </span>
              )}
              {suggestion.type === "column" && suggestion.columnType && (
                <span className="text-[10px] text-muted-foreground">{suggestion.columnType}</span>
              )}
            </div>
          </button>
        ))}
      </div>
      <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t bg-muted/30">
        <kbd className="px-1 rounded bg-muted">↑↓</kbd> navigate
        <span className="mx-1.5">·</span>
        <kbd className="px-1 rounded bg-muted">Tab</kbd> select
        <span className="mx-1.5">·</span>
        <kbd className="px-1 rounded bg-muted">Esc</kbd> close
      </div>
    </div>
  );
};

export default SchemaAutocomplete;
