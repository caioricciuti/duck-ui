import React, { useMemo } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Column visibility panel. Defined at module level on purpose: defining it
 * inside DuckUITable recreated the component type on every parent render,
 * remounting the panel and dropping input focus on each keystroke (the
 * "filter deselects while typing" bug from the Show HN thread).
 */
interface ColumnSelectorPanelProps {
  columnKeys: string[];
  enabledColumns: Record<string, boolean>;
  filter: string;
  onFilterChange: (value: string) => void;
  onToggleColumn: (columnId: string) => void;
  onToggleAll: (value: boolean) => void;
  onClose: () => void;
}

const ColumnSelectorPanel: React.FC<ColumnSelectorPanelProps> = React.memo(
  ({
    columnKeys,
    enabledColumns,
    filter,
    onFilterChange,
    onToggleColumn,
    onToggleAll,
    onClose,
  }) => {
    const filteredColumnKeys = useMemo(() => {
      if (!filter) return columnKeys;
      return columnKeys.filter((key) => key.toLowerCase().includes(filter.toLowerCase()));
    }, [columnKeys, filter]);

    const visibleCount = columnKeys.filter((key) => enabledColumns[key] !== false).length;
    const totalCount = columnKeys.length;

    return (
      <Card className="column-selector-panel absolute right-0 top-12 z-20 w-[350px] bg-background shadow-lg rounded-md border p-2">
        <CardContent className="p-2">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-semibold">
              Toggle Columns{" "}
              <span className="text-xs text-muted-foreground">
                ({visibleCount}/{totalCount})
              </span>
            </h3>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-1.5 text-xs"
                onClick={() => onToggleAll(true)}
              >
                All
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-1.5 text-xs"
                onClick={() => onToggleAll(false)}
              >
                None
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => onFilterChange(e.target.value)}
              placeholder="Filter columns..."
              className="pl-7 h-7 text-xs w-full"
            />
            {filter && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-5 w-5 p-0"
                onClick={() => onFilterChange("")}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <div className="h-[350px] pr-1 overflow-y-auto space-y-1">
            {filteredColumnKeys.map((columnId) => (
              <div key={columnId} className="flex items-center space-x-2 pl-1">
                <Checkbox
                  id={`column-sel-${columnId}`}
                  checked={enabledColumns[columnId] !== false}
                  onCheckedChange={() => onToggleColumn(columnId)}
                />
                <label
                  htmlFor={`column-sel-${columnId}`}
                  className="text-xs cursor-pointer truncate max-w-[240px]"
                  title={columnId}
                >
                  {columnId}
                </label>
              </div>
            ))}
            {filteredColumnKeys.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-2">
                No columns match your filter.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
);
ColumnSelectorPanel.displayName = "ColumnSelectorPanel";

export default ColumnSelectorPanel;
