import React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";

interface SpreadsheetOptionsPanelProps {
  showRowNumbers: boolean;
  zebraStripes: boolean;
  showGridLines: boolean;
  onShowRowNumbers: (value: boolean) => void;
  onZebraStripes: (value: boolean) => void;
  onShowGridLines: (value: boolean) => void;
  onClose: () => void;
}

const SpreadsheetOptionsPanel: React.FC<SpreadsheetOptionsPanelProps> = React.memo(
  ({
    showRowNumbers,
    zebraStripes,
    showGridLines,
    onShowRowNumbers,
    onZebraStripes,
    onShowGridLines,
    onClose,
  }) => (
    <Card className="spreadsheet-options-panel absolute right-0 top-12 z-20 w-[300px] bg-background shadow-lg rounded-md border p-2">
      <CardContent className="p-2">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold">Spreadsheet Options</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onClose}
            aria-label="Close spreadsheet options"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="show-row-numbers"
              checked={showRowNumbers}
              onCheckedChange={(checked) => onShowRowNumbers(checked === true)}
            />
            <label htmlFor="show-row-numbers" className="text-xs cursor-pointer">
              Show row numbers
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="zebra-stripes"
              checked={zebraStripes}
              onCheckedChange={(checked) => onZebraStripes(checked === true)}
            />
            <label htmlFor="zebra-stripes" className="text-xs cursor-pointer">
              Zebra stripes
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="show-grid-lines"
              checked={showGridLines}
              onCheckedChange={(checked) => onShowGridLines(checked === true)}
            />
            <label htmlFor="show-grid-lines" className="text-xs cursor-pointer">
              Show grid lines
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  )
);
SpreadsheetOptionsPanel.displayName = "SpreadsheetOptionsPanel";

export default SpreadsheetOptionsPanel;
