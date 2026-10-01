import { z } from "zod";

// Utility Functions
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export const getErrorSuggestion = (errorMessage: string): string | null => {
  const lowerError = errorMessage.toLowerCase();

  // Network/URL errors
  if (
    lowerError.includes("fetch") ||
    lowerError.includes("network") ||
    lowerError.includes("cors")
  ) {
    return "Check your internet connection and ensure the URL is publicly accessible. CORS restrictions may prevent access to some URLs.";
  }

  // File format errors
  if (
    lowerError.includes("invalid") &&
    (lowerError.includes("csv") || lowerError.includes("json") || lowerError.includes("parquet"))
  ) {
    return "The file format may be corrupted or not match the expected structure. Try opening the file locally to verify its contents.";
  }

  // Parsing errors
  if (lowerError.includes("parse") || lowerError.includes("syntax")) {
    return "Data parsing failed. Consider adjusting CSV options like delimiter, quote character, or enabling 'ignore errors'.";
  }

  // Type detection errors
  if (lowerError.includes("type") || lowerError.includes("column")) {
    return "Column type detection failed. Try enabling 'auto-detect types' or manually specify column types in schema customization.";
  }

  // Authentication errors
  if (
    lowerError.includes("401") ||
    lowerError.includes("403") ||
    lowerError.includes("unauthorized")
  ) {
    return "Access denied. The URL may require authentication or the resource is not publicly accessible.";
  }

  // Not found errors
  if (lowerError.includes("404") || lowerError.includes("not found")) {
    return "The file was not found at the specified URL. Verify the URL is correct and the file still exists.";
  }

  // Memory/size errors
  if (lowerError.includes("memory") || lowerError.includes("out of")) {
    return "The file may be too large to process. Try importing a smaller file or use sampling options.";
  }

  // Table name errors. "does not exist" is a different family (a missing
  // function or file), so only the exact phrase counts.
  if (lowerError.includes("already exists")) {
    return "A table with this name already exists. Choose a different name or the existing table will be replaced.";
  }

  return null;
};

// Zod Schema for Table Name Validation
export const tableNameSchema = z
  .string()
  .trim()
  .min(1, "Table name cannot be empty")
  .regex(/^[a-zA-Z0-9_]+$/, "Table name can only contain letters, numbers, and underscores");
