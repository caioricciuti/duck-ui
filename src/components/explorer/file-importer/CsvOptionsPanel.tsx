import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CsvImportOptions, FileImportState, FileWithPreview } from "./types";

interface CsvOptionsPanelProps {
  file: FileWithPreview;
  status: FileImportState;
  csvOptions: CsvImportOptions;
  showAdvancedOptions: boolean;
  setShowAdvancedOptions: (show: boolean) => void;
  handleCsvOptionChange: (
    key: keyof CsvImportOptions,
    value: string | boolean | number | undefined
  ) => void;
}

const CsvOptionsPanel: React.FC<CsvOptionsPanelProps> = ({
  file,
  status,
  csvOptions,
  showAdvancedOptions,
  setShowAdvancedOptions,
  handleCsvOptionChange,
}) => {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="font-medium text-sm">CSV Import Options</h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
        >
          {showAdvancedOptions ? "Hide Options" : "Show Options"}
        </Button>
      </div>

      {showAdvancedOptions && (
        <div className="p-3 rounded-md space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id={`header-${file.name}`}
                checked={csvOptions.header}
                onChange={(e) => handleCsvOptionChange("header", e.target.checked)}
                disabled={status.status === "uploading" || status.status === "processing"}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Label htmlFor={`header-${file.name}`} className="text-sm">
                Has header row
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id={`auto-detect-${file.name}`}
                checked={csvOptions.autoDetect}
                onChange={(e) => handleCsvOptionChange("autoDetect", e.target.checked)}
                disabled={status.status === "uploading" || status.status === "processing"}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Label htmlFor={`auto-detect-${file.name}`} className="text-sm">
                Auto-detect types
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id={`ignore-errors-${file.name}`}
                checked={csvOptions.ignoreErrors}
                onChange={(e) => handleCsvOptionChange("ignoreErrors", e.target.checked)}
                disabled={status.status === "uploading" || status.status === "processing"}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Label htmlFor={`ignore-errors-${file.name}`} className="text-sm">
                Ignore errors
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id={`null-padding-${file.name}`}
                checked={csvOptions.nullPadding}
                onChange={(e) => handleCsvOptionChange("nullPadding", e.target.checked)}
                disabled={status.status === "uploading" || status.status === "processing"}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Label htmlFor={`null-padding-${file.name}`} className="text-sm">
                Pad missing columns
              </Label>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor={`delimiter-${file.name}`} className="text-sm">
              Delimiter
            </Label>
            <div className="max-w-xs">
              <Input
                id={`delimiter-${file.name}`}
                value={csvOptions.delimiter}
                onChange={(e) => handleCsvOptionChange("delimiter", e.target.value)}
                placeholder="Delimiter character"
                className="h-8"
                disabled={status.status === "uploading" || status.status === "processing"}
              />
            </div>
            <p className="text-xs text-gray-500">
              Common values: , (comma), ; (semicolon), tab, pipe (|)
            </p>
          </div>

          {/* Advanced CSV Options */}
          <div className="space-y-3 pt-3 border-t">
            <h5 className="font-medium text-sm text-muted-foreground">Advanced Options</h5>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor={`quote-${file.name}`} className="text-xs">
                  Quote Character
                </Label>
                <Input
                  id={`quote-${file.name}`}
                  value={csvOptions.quote || ""}
                  onChange={(e) => handleCsvOptionChange("quote", e.target.value)}
                  placeholder={`" (default)`}
                  className="h-8 text-xs"
                  disabled={status.status === "uploading" || status.status === "processing"}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`escape-${file.name}`} className="text-xs">
                  Escape Character
                </Label>
                <Input
                  id={`escape-${file.name}`}
                  value={csvOptions.escape || ""}
                  onChange={(e) => handleCsvOptionChange("escape", e.target.value)}
                  placeholder={`" (default)`}
                  className="h-8 text-xs"
                  disabled={status.status === "uploading" || status.status === "processing"}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`skip-${file.name}`} className="text-xs">
                  Skip Rows
                </Label>
                <Input
                  id={`skip-${file.name}`}
                  type="number"
                  min="0"
                  value={csvOptions.skip || ""}
                  onChange={(e) =>
                    handleCsvOptionChange("skip", parseInt(e.target.value, 10) || undefined)
                  }
                  placeholder="0"
                  className="h-8 text-xs"
                  disabled={status.status === "uploading" || status.status === "processing"}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`sample-size-${file.name}`} className="text-xs">
                  Sample Size
                </Label>
                <Input
                  id={`sample-size-${file.name}`}
                  type="number"
                  min="1"
                  value={csvOptions.sampleSize || ""}
                  onChange={(e) =>
                    handleCsvOptionChange("sampleSize", parseInt(e.target.value, 10) || undefined)
                  }
                  placeholder="Auto"
                  className="h-8 text-xs"
                  disabled={status.status === "uploading" || status.status === "processing"}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor={`null-str-${file.name}`} className="text-xs">
                NULL String
              </Label>
              <Input
                id={`null-str-${file.name}`}
                value={csvOptions.nullStr || ""}
                onChange={(e) => handleCsvOptionChange("nullStr", e.target.value)}
                placeholder="Empty values treated as NULL"
                className="h-8 text-xs"
                disabled={status.status === "uploading" || status.status === "processing"}
              />
              <p className="text-xs text-muted-foreground">
                Values matching this string will be treated as NULL
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor={`date-format-${file.name}`} className="text-xs">
                  Date Format
                </Label>
                <Input
                  id={`date-format-${file.name}`}
                  value={csvOptions.dateFormat || ""}
                  onChange={(e) => handleCsvOptionChange("dateFormat", e.target.value)}
                  placeholder="ISO 8601"
                  className="h-8 text-xs"
                  disabled={status.status === "uploading" || status.status === "processing"}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`timestamp-format-${file.name}`} className="text-xs">
                  Timestamp Format
                </Label>
                <Input
                  id={`timestamp-format-${file.name}`}
                  value={csvOptions.timestampFormat || ""}
                  onChange={(e) => handleCsvOptionChange("timestampFormat", e.target.value)}
                  placeholder="ISO 8601"
                  className="h-8 text-xs"
                  disabled={status.status === "uploading" || status.status === "processing"}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CsvOptionsPanel;
