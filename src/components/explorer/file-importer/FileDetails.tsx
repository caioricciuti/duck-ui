import React, { useState, useMemo } from "react";
import { format } from "date-fns";
import { FileWarning, FileCheck, X, FileIcon, Calendar, HardDrive, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { z } from "zod";
import CsvOptionsPanel from "./CsvOptionsPanel";
import { formatFileSize, tableNameSchema } from "./helpers";
import type { CsvImportOptions, FileImportState, FileWithPreview } from "./types";

interface FileDetailsProps {
  file: FileWithPreview;
  tableName: string;
  onTableNameChange: (name: string) => void;
  status: FileImportState;
  onRemove: () => void;
  onRetry: () => void;
  csvOptions?: CsvImportOptions;
  onCsvOptionsChange?: (options: CsvImportOptions) => void;
}

const getFileIcon = (fileType: string) => {
  const iconProps = { className: "w-8 h-8" };
  switch (fileType.toLowerCase()) {
    case "csv":
      return <FileIcon {...iconProps} color="#38A169" />;
    case "json":
      return <FileIcon {...iconProps} color="#D69E2E" />;
    case "parquet":
      return <FileIcon {...iconProps} color="#3182CE" />;
    case "arrow":
      return <FileIcon {...iconProps} color="#805AD5" />;
    case "duckdb":
      return <FileIcon {...iconProps} color="#ED8936" />;
    case "xlsx":
      return <FileIcon {...iconProps} color="#4299E1" />;
    default:
      return <FileIcon {...iconProps} color="#718096" />;
  }
};

const FileDetails: React.FC<FileDetailsProps> = ({
  file,
  tableName,
  onTableNameChange,
  status,
  onRemove,
  onRetry,
  csvOptions,
  onCsvOptionsChange,
}) => {
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const fileType = file.name.split(".").pop()?.toLowerCase() || "";
  const lastModified = new Date(file.lastModified);
  const isCsvFile = fileType === "csv";

  const tableNameError = useMemo(() => {
    try {
      tableNameSchema.parse(tableName);
      return null;
    } catch (error) {
      return error instanceof z.ZodError ? error.issues[0].message : "Invalid table name";
    }
  }, [tableName]);

  // Handle CSV option changes
  const handleCsvOptionChange = (
    key: keyof CsvImportOptions,
    value: string | boolean | number | undefined
  ) => {
    if (onCsvOptionsChange && csvOptions) {
      onCsvOptionsChange({
        ...csvOptions,
        [key]: value,
      });
    }
  };

  return (
    <div className="rounded-lg border p-4 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">{getFileIcon(fileType)}</div>

        <div className="flex-grow space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-medium text-lg">{file.name}</h3>
              <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1">
                      <HardDrive className="w-4 h-4" />
                      {formatFileSize(file.size)}
                    </TooltipTrigger>
                    <TooltipContent>File size</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {format(lastModified, "MMM dd, yyyy")}
                    </TooltipTrigger>
                    <TooltipContent>Last modified</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <span className="uppercase px-2 py-0.5 rounded text-xs">{fileType}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {status.status === "error" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRetry}
                  className="text-gray-500 hover:text-gray-700"
                  aria-label="Retry"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onRemove}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Remove file"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`table-${file.name}`}>Table Name</Label>
            <Input
              id={`table-${file.name}`}
              value={tableName}
              required
              onChange={(e) => onTableNameChange(e.target.value)}
              placeholder="Enter table name"
              className="max-w-md p-2 ml-1"
              disabled={status.status === "uploading" || status.status === "processing"}
            />
            {tableNameError && <p className="text-sm text-red-500">{tableNameError}</p>}
            <p className="text-sm text-gray-500">
              This name will be used to reference the table in SQL queries
            </p>
          </div>

          {/* CSV import options */}
          {isCsvFile && csvOptions && (
            <CsvOptionsPanel
              file={file}
              status={status}
              csvOptions={csvOptions}
              showAdvancedOptions={showAdvancedOptions}
              setShowAdvancedOptions={setShowAdvancedOptions}
              handleCsvOptionChange={handleCsvOptionChange}
            />
          )}

          {status.status === "uploading" && status.progress !== undefined && (
            <div className="flex flex-col space-y-2">
              <span className="text-sm text-gray-500">Uploading... {status.progress}%</span>
              <Progress value={status.progress} />
            </div>
          )}

          {status.status === "success" && (
            <div className="flex items-center gap-2 text-green-600 bg-green-50 p-2 rounded max-w-md ">
              <FileCheck className="w-4 h-4" />
              <span className="text-sm">Successfully imported</span>
            </div>
          )}

          {status.status === "error" && status.error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-500/20 p-2 rounded max-w-md">
              <FileWarning className="w-4 h-4" />
              <span className="text-xs">{status.error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileDetails;
