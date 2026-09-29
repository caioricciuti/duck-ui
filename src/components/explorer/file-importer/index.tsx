import React, { useState } from "react";
import { Upload, Link as LinkIcon, Code } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PreviewPanel from "./PreviewPanel";
import QueryTab from "./QueryTab";
import UploadTab from "./UploadTab";
import UrlTab from "./UrlTab";
import type { FileImporterProps, ImportMode, UploadError } from "./types";
import { useLocalFileImport } from "./useLocalFileImport";
import { useQueryImport } from "./useQueryImport";
import { useUrlImport } from "./useUrlImport";

const FileImporter: React.FC<FileImporterProps> = ({ isSheetOpen, setIsSheetOpen }) => {
  const [activeTab, setActiveTab] = useState("upload");
  const [errors, setErrors] = useState<UploadError[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>("table");

  const localImport = useLocalFileImport({ importMode, setErrors, setIsSheetOpen });
  const urlImport = useUrlImport({ importMode, setErrors, setIsSheetOpen });
  const queryImport = useQueryImport({ importMode, setErrors, setIsSheetOpen });
  const { isPreviewMode, previewData } = urlImport;

  return (
    <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
      <SheetContent className="xl:w-[800px] sm:w-full sm:max-w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isPreviewMode ? "Preview Data" : "Import Data"}</SheetTitle>
        </SheetHeader>
        <Separator className="my-4" />

        {/* Preview Mode UI */}
        {isPreviewMode && previewData && (
          <PreviewPanel
            previewData={previewData}
            previewFileName={urlImport.previewFileName}
            previewTableName={urlImport.previewTableName}
            isUrlImporting={urlImport.isUrlImporting}
            errors={errors}
            handleBackFromPreview={urlImport.handleBackFromPreview}
            handleImportFromPreview={urlImport.handleImportFromPreview}
            schemaColumns={urlImport.schemaColumns}
            isSchemaCustomizing={urlImport.isSchemaCustomizing}
            setIsSchemaCustomizing={urlImport.setIsSchemaCustomizing}
            handleToggleColumn={urlImport.handleToggleColumn}
            handleRenameColumn={urlImport.handleRenameColumn}
            handleChangeColumnType={urlImport.handleChangeColumnType}
          />
        )}

        {/* Import Tabs (when not in preview mode) */}
        {!isPreviewMode && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="upload" className="gap-2">
                <Upload className="w-4 h-4" />
                Upload Files
              </TabsTrigger>
              <TabsTrigger value="url" className="gap-2">
                <LinkIcon className="w-4 h-4" />
                From URL
              </TabsTrigger>
              <TabsTrigger value="query" className="gap-2">
                <Code className="w-4 h-4" />
                From Query
              </TabsTrigger>
            </TabsList>

            {/* Upload Files Tab */}
            <UploadTab
              {...localImport}
              importMode={importMode}
              setImportMode={setImportMode}
              errors={errors}
            />

            {/* URL Import Tab */}
            <UrlTab
              importMode={importMode}
              setImportMode={setImportMode}
              errors={errors}
              urlInput={urlImport.urlInput}
              setUrlInput={urlImport.setUrlInput}
              urlTableName={urlImport.urlTableName}
              setUrlTableName={urlImport.setUrlTableName}
              isUrlImporting={urlImport.isUrlImporting}
              isPreviewing={urlImport.isPreviewing}
              handlePreview={urlImport.handlePreview}
              handleUrlImport={urlImport.handleUrlImport}
            />

            {/* Query Import Tab */}
            <QueryTab
              {...queryImport}
              importMode={importMode}
              setImportMode={setImportMode}
              errors={errors}
            />
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default FileImporter;
