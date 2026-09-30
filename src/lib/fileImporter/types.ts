import type { SUPPORTED_FILE_EXTENSIONS } from "./constants";

// Types
export type FileExtension = (typeof SUPPORTED_FILE_EXTENSIONS)[number];

export interface FileWithPreview extends File {
  preview?: string;
}

export interface UploadError {
  id: string;
  message: string;
  file?: string;
  severity: "error" | "warning";
}

export interface FileImportState {
  fileName: string;
  status: "pending" | "uploading" | "processing" | "success" | "error";
  progress?: number;
  error?: string;
}

// CSV import options
export interface CsvImportOptions {
  ignoreErrors: boolean;
  nullPadding: boolean;
  allVarchar: boolean;
  header: boolean;
  delimiter: string;
  autoDetect: boolean;
  // Advanced options
  quote?: string;
  escape?: string;
  skip?: number;
  nullStr?: string;
  dateFormat?: string;
  timestampFormat?: string;
  sampleSize?: number;
}

// Schema customization
export interface SchemaColumn {
  originalName: string;
  newName: string;
  type: string;
  /** The type the file was read with. A `type` that differs is a requested cast. */
  originalType?: string;
  included: boolean;
}

export interface FileImporterProps {
  isSheetOpen: boolean;
  setIsSheetOpen: (open: boolean) => void;
  context?: string;
}

export type ImportMode = "table" | "view";
