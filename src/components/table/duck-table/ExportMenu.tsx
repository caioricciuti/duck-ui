import React from "react";
import {
  Download,
  ChevronDown,
  FolderOpen,
  FileSpreadsheet,
  FileJson,
  FileText,
  FileArchive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useDuckStore } from "@/store";
import type { TableExporters } from "./tableExport";
import type { DataRow } from "./types";

interface ExportMenuProps extends TableExporters {
  data: DataRow[];
}

/** Export dropdown: downloads plus "Save to Folder" for mounted folders. */
const ExportMenu: React.FC<ExportMenuProps> = ({
  data,
  exportToCSV,
  exportToJSON,
  exportToXLSX,
  exportToDuckDB,
  saveToFolderAsCSV,
  saveToFolderAsJSON,
  saveToFolderAsXLSX,
  saveToFolderAsParquet,
}) => {
  // Get mounted folders from store
  const mountedFolders = useDuckStore((state) => state.mountedFolders);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={!data || !data.length}
          title="Export data in various formats"
        >
          <Download className="mr-1 h-3.5 w-3.5" />
          Export
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportToCSV}>
          <Download className="mr-2 h-3.5 w-3.5" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToJSON}>
          <Download className="mr-2 h-3.5 w-3.5" />
          Export as JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToXLSX}>
          <Download className="mr-2 h-3.5 w-3.5" />
          Export as Excel (XLSX)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToDuckDB}>
          <Download className="mr-2 h-3.5 w-3.5" />
          Export as Parquet
        </DropdownMenuItem>

        {/* Save to Folder submenu */}
        {mountedFolders.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderOpen className="mr-2 h-3.5 w-3.5" />
                Save to Folder
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {mountedFolders.map((folder) => (
                  <DropdownMenuSub key={folder.id}>
                    <DropdownMenuSubTrigger>
                      <FolderOpen className="mr-2 h-3.5 w-3.5" />
                      {folder.name}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onClick={() => saveToFolderAsCSV(folder.id, folder.name)}>
                        <FileText className="mr-2 h-3.5 w-3.5" />
                        Save as CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => saveToFolderAsJSON(folder.id, folder.name)}>
                        <FileJson className="mr-2 h-3.5 w-3.5" />
                        Save as JSON
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => saveToFolderAsXLSX(folder.id, folder.name)}>
                        <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
                        Save as Excel (XLSX)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => saveToFolderAsParquet(folder.id, folder.name)}
                      >
                        <FileArchive className="mr-2 h-3.5 w-3.5" />
                        Save as Parquet
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ExportMenu;
