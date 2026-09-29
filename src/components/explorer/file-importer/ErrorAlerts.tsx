import React from "react";
import { AlertTriangle, FileWarning } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getErrorSuggestion } from "./helpers";
import type { UploadError } from "./types";

interface ErrorAlertListProps {
  errors: UploadError[];
}

/** Error list shown on the preview, URL and query views. */
export const ErrorAlertList: React.FC<ErrorAlertListProps> = ({ errors }) => {
  return (
    <div className="space-y-2">
      {errors.map((error) => {
        const suggestion = getErrorSuggestion(error.message);
        return (
          <Alert key={error.id} variant="destructive">
            <AlertTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Error
            </AlertTitle>
            <AlertDescription>
              <div className="space-y-2">
                <p>{error.message}</p>
                {suggestion && (
                  <p className="text-sm opacity-90 border-t pt-2 mt-2">
                    <strong>Suggestion:</strong> {suggestion}
                  </p>
                )}
              </div>
            </AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
};

/** Error list shown on the upload tab, with severity and file name. */
export const UploadErrorAlertList: React.FC<ErrorAlertListProps> = ({ errors }) => {
  return (
    <div className="space-y-2">
      {errors.map((error) => {
        const suggestion = getErrorSuggestion(error.message);
        return (
          <Alert key={error.id} variant={error.severity === "error" ? "destructive" : "default"}>
            <AlertTitle className="flex items-center gap-2">
              {error.severity === "error" ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <FileWarning className="h-4 w-4" />
              )}
              {error.severity === "error" ? "Error" : "Warning"}
            </AlertTitle>
            <AlertDescription>
              <div className="space-y-2">
                <p>{error.file ? `${error.file}: ${error.message}` : error.message}</p>
                {suggestion && (
                  <p className="text-sm opacity-90 border-t pt-2 mt-2">
                    <strong>Suggestion:</strong> {suggestion}
                  </p>
                )}
              </div>
            </AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
};
