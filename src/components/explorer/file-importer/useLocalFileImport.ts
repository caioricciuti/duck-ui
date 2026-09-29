import React, { useCallback, useState, useMemo, useRef, useEffect } from "react";
import { useDuckStore } from "@/store";
import { generateUUID } from "@/lib/utils";
import { z } from "zod";
import { toast } from "sonner";
import {
  DEFAULT_CSV_OPTIONS,
  MAX_CONCURRENT_UPLOADS,
  MAX_FILE_SIZE,
  SUPPORTED_FILE_EXTENSIONS,
} from "./constants";
import { formatFileSize, tableNameSchema } from "./helpers";
import type {
  CsvImportOptions,
  FileExtension,
  FileImportState,
  FileWithPreview,
  ImportMode,
  UploadError,
} from "./types";

interface UseLocalFileImportArgs {
  importMode: ImportMode;
  setErrors: React.Dispatch<React.SetStateAction<UploadError[]>>;
  setIsSheetOpen: (open: boolean) => void;
}

/** State and handlers for importing files picked or dropped from disk. */
export function useLocalFileImport({
  importMode,
  setErrors,
  setIsSheetOpen,
}: UseLocalFileImportArgs) {
  const importFile = useDuckStore((s) => s.importFile);
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [tableNames, setTableNames] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [importStates, setImportStates] = useState<Record<string, FileImportState>>({});
  const [csvOptions, setCsvOptions] = useState<Record<string, CsvImportOptions>>({});
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const hasFilesToImport = useMemo(() => files.length > 0, [files]);

  const allFilesSuccess = useMemo(() => {
    if (!files.length) return false;
    return files.every((file) => importStates[file.name]?.status === "success");
  }, [files, importStates]);

  const validateFile = (file: File): UploadError[] => {
    const errors: UploadError[] = [];
    const extension = file.name.split(".").pop()?.toLowerCase() as FileExtension;

    if (!extension || !SUPPORTED_FILE_EXTENSIONS.includes(extension)) {
      errors.push({
        id: generateUUID(),
        file: file.name,
        message: `Unsupported file type: .${extension}`,
        severity: "error",
      });
      toast.error(`Unsupported file type: .${extension}`);
    }

    if (file.size > MAX_FILE_SIZE) {
      errors.push({
        id: generateUUID(),
        file: file.name,
        message: `File exceeds maximum size of ${formatFileSize(MAX_FILE_SIZE)}`,
        severity: "error",
      });
      toast.warning(`File exceeds maximum size of ${formatFileSize(MAX_FILE_SIZE)}`);
    }

    return errors;
  };

  const updateImportState = (fileName: string, state: Partial<FileImportState>) => {
    setImportStates((prev) => ({
      ...prev,
      [fileName]: {
        ...prev[fileName],
        ...state,
      },
    }));
  };

  const onFileChange = useCallback(
    (newFiles: File[]) => {
      setErrors([]);
      const newErrors: UploadError[] = [];
      const validFiles: FileWithPreview[] = [];

      newFiles.forEach((file) => {
        const fileErrors = validateFile(file);
        if (fileErrors.length > 0) {
          newErrors.push(...fileErrors);
        } else {
          validFiles.push(
            Object.assign(file, {
              preview: URL.createObjectURL(file),
            })
          );
        }
      });

      if (newErrors.length > 0) {
        setErrors(newErrors);
      }

      setFiles((prevFiles) => [...prevFiles, ...validFiles]);

      const newTableNames = validFiles.reduce<Record<string, string>>(
        (acc, file) => ({
          ...acc,
          [file.name]: file.name
            .replace(/\.[^/.]+$/, "")
            .replace(/[^a-zA-Z0-9_]/g, "_")
            .toLowerCase(),
        }),
        {}
      );

      setTableNames((prev) => ({ ...prev, ...newTableNames }));

      // Initialize CSV options for any CSV files
      const newCsvOptions = validFiles.reduce<Record<string, CsvImportOptions>>((acc, file) => {
        const extension = file.name.split(".").pop()?.toLowerCase();
        if (extension === "csv") {
          acc[file.name] = { ...DEFAULT_CSV_OPTIONS };
        }
        return acc;
      }, {});

      setCsvOptions((prev) => ({ ...prev, ...newCsvOptions }));

      const initialImportStates = validFiles.reduce<Record<string, FileImportState>>(
        (acc, file) => {
          acc[file.name] = {
            fileName: file.name,
            status: "pending",
          };
          return acc;
        },
        {}
      );

      setImportStates((prev) => ({ ...prev, ...initialImportStates }));
    },
    [setErrors]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragActive(false);
      if (!event.dataTransfer.files || event.dataTransfer.files.length === 0) return;
      onFileChange(Array.from(event.dataTransfer.files));
    },
    [onFileChange]
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
  }, []);

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files.length > 0) {
        onFileChange(Array.from(event.target.files));
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [onFileChange]
  );

  const handleFileUpload = async () => {
    setIsUploading(true);
    setErrors([]);

    try {
      const uploadPromises = files.map(async (file) => {
        const state = importStates[file.name];
        if (state?.status === "success") return;

        const cleanTableName = tableNames[file.name];
        try {
          tableNameSchema.parse(cleanTableName);
        } catch (error) {
          const errorMessage =
            error instanceof z.ZodError ? error.issues[0].message : "Invalid table name";
          setErrors((prev) => [
            ...prev,
            {
              id: generateUUID(),
              message: errorMessage,
              file: file.name,
              severity: "error",
            },
          ]);
          updateImportState(file.name, {
            status: "error",
            error: errorMessage,
          });
          toast.error(`Invalid table name for ${file.name}`);
          return;
        }

        updateImportState(file.name, { status: "processing" });

        try {
          const fileType = file.name.split(".").pop()?.toLowerCase() as FileExtension;
          const arrayBuffer = await file.arrayBuffer();

          // Add options for import
          const importOptions: Record<string, unknown> = {
            importMode, // "table" or "view"
          };
          if (fileType === "csv" && csvOptions[file.name]) {
            importOptions.csv = csvOptions[file.name];
          }

          await importFile(
            file.name,
            arrayBuffer,
            cleanTableName,
            fileType,
            undefined,
            importOptions
          );
          updateImportState(file.name, { status: "success" });
          toast.success(`Successfully imported ${file.name}`);
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : "Unknown error";
          updateImportState(file.name, {
            status: "error",
            error: errorMessage,
          });
          setErrors((prev) => [
            ...prev,
            {
              id: generateUUID(),
              message: errorMessage,
              file: errorMessage === "File processing aborted" ? undefined : file.name,
              severity: "error",
            },
          ]);
          toast.error(`Error importing ${file.name}`);
        }
      });

      // Run promises with concurrency control
      const concurrencyQueue = [];
      for (let i = 0; i < uploadPromises.length; i += MAX_CONCURRENT_UPLOADS) {
        const chunk = uploadPromises.slice(i, i + MAX_CONCURRENT_UPLOADS);
        concurrencyQueue.push(Promise.all(chunk));
      }

      await Promise.all(concurrencyQueue);

      if (allFilesSuccess) {
        setIsSheetOpen(false);
        setFiles([]);
        setTableNames({});
        setImportStates({});
        toast.success("All files imported successfully");
      }
    } catch (e) {
      console.error("Error uploading: ", e);
      toast.error("Error uploading files");
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancelUpload = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsUploading(false);
    toast.warning("Upload cancelled");
  }, []);

  const removeFile = useCallback(
    (fileName: string) => {
      setFiles((prev) => prev.filter((file) => file.name !== fileName));
      setTableNames((prev) => {
        const newNames = { ...prev };
        delete newNames[fileName];
        return newNames;
      });
      setErrors((prev) => prev.filter((error) => error.file !== fileName));
      setImportStates((prev) => {
        const newStates = { ...prev };
        delete newStates[fileName];
        return newStates;
      });

      const file = files.find((f) => f.name === fileName);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }

      toast.info(`Removed ${fileName}`);
    },
    [files, setErrors]
  );

  const retryFileUpload = useCallback((fileName: string) => {
    setImportStates((prev) => ({
      ...prev,
      [fileName]: {
        ...prev[fileName],
        status: "pending",
        error: undefined,
      },
    }));
    toast.info(`Retrying upload for ${fileName}`);
  }, []);

  useEffect(() => {
    return () => {
      files.forEach((file) => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
  }, [files]);

  return {
    files,
    tableNames,
    setTableNames,
    isUploading,
    importStates,
    csvOptions,
    setCsvOptions,
    isDragActive,
    fileInputRef,
    hasFilesToImport,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleFileInputChange,
    handleFileUpload,
    handleCancelUpload,
    removeFile,
    retryFileUpload,
  };
}

export type LocalFileImport = ReturnType<typeof useLocalFileImport>;
