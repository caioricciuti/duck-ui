import { Play, Loader2, Plus, Code, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NotebookToolbarProps {
  onRunAll: () => void;
  onAddCell: (type: "sql" | "markdown") => void;
  isRunning: boolean;
  cellCount: number;
}

export function NotebookToolbar({ onRunAll, onAddCell, isRunning, cellCount }: NotebookToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
      <Button
        variant="outline"
        size="sm"
        onClick={onRunAll}
        disabled={isRunning}
        className="gap-2"
      >
        {isRunning ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
        {isRunning ? "Running..." : "Run All"}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <Plus className="h-3.5 w-3.5" />
            Add Cell
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => onAddCell("sql")}>
            <Code className="h-4 w-4 mr-2" />
            SQL Cell
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddCell("markdown")}>
            <Type className="h-4 w-4 mr-2" />
            Markdown Cell
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="text-xs text-muted-foreground ml-auto">
        {cellCount} cell{cellCount !== 1 ? "s" : ""}
      </span>
    </div>
  );
}
