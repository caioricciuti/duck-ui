import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDuckStore } from "@/store";
import type { ImportPlan } from "@/lib/projectBundle/format";
import {
  applyProjectImport,
  downloadProjectExport,
  previewProjectImport,
} from "@/services/projectTransfer";

interface PreviewRow {
  kind: string;
  name: string;
  action: "create" | "overwrite";
}

const rowsOf = (plan: ImportPlan): PreviewRow[] => [
  ...plan.queries.map((entry) => ({
    kind: "Query",
    name: entry.item.name,
    action: entry.action,
  })),
  ...plan.notebooks.map((entry) => ({
    kind: "Notebook",
    name: entry.item.title,
    action: entry.action,
  })),
  ...plan.dashboards.map((entry) => ({
    kind: "Dashboard",
    name: entry.item.name,
    action: entry.action,
  })),
];

/**
 * Previews a project zip and imports it on confirmation. Opens whenever
 * `file` is set; `onClose` clears it.
 */
export function ProjectImportDialog({ file, onClose }: { file: File | null; onClose: () => void }) {
  const currentProfileId = useDuckStore((s) => s.currentProfileId);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!file || !currentProfileId) return;
    let cancelled = false;
    previewProjectImport(currentProfileId, file)
      .then((result) => {
        if (!cancelled) setPlan(result);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Could not read this file");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [file, currentProfileId]);

  const close = () => {
    setPlan(null);
    setError(null);
    onClose();
  };

  const rows = plan ? rowsOf(plan) : [];
  const overwrites = rows.filter((row) => row.action === "overwrite").length;

  const handleImport = async () => {
    if (!plan || !currentProfileId) return;
    setIsImporting(true);
    try {
      await applyProjectImport(currentProfileId, plan);
      toast.success(`Imported ${rows.length} item${rows.length === 1 ? "" : "s"}`);
      close();
    } catch (reason) {
      toast.error(`Import failed: ${reason instanceof Error ? reason.message : "unknown error"}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import project</DialogTitle>
          <DialogDescription>{file?.name}</DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !plan ? (
          <p className="text-sm text-muted-foreground">Reading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No queries, notebooks or dashboards found in this file.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {rows.length - overwrites} new, {overwrites} will be overwritten (matched by id, then
              by name).
            </p>
            <ScrollArea className="max-h-72 rounded-md border">
              <ul className="divide-y text-sm">
                {rows.map((row, index) => (
                  <li key={index} className="flex items-center gap-2 px-3 py-2">
                    <span className="w-20 shrink-0 text-xs text-muted-foreground">{row.kind}</span>
                    <span className="flex-1 truncate">{row.name}</span>
                    <Badge variant={row.action === "overwrite" ? "destructive" : "secondary"}>
                      {row.action === "overwrite" ? "Overwrite" : "Create"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!plan || rows.length === 0 || isImporting}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Hidden file picker for project zips. */
export function ProjectFileInput({
  inputRef,
  onFile,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept=".zip,application/zip"
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0];
        // Reset so choosing the same file again still fires a change.
        event.target.value = "";
        if (file) onFile(file);
      }}
    />
  );
}

/** The "Project" section of Settings. */
export default function ProjectTransfer() {
  const currentProfileId = useDuckStore((s) => s.currentProfileId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!currentProfileId) return;
    setIsExporting(true);
    await downloadProjectExport(currentProfileId);
    setIsExporting(false);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Project files</h3>
      <p className="text-xs text-muted-foreground">
        Export saved queries, notebooks and dashboards as a zip of plain <code>.sql</code> and{" "}
        <code>.md</code> files you can commit to git. Connections, credentials and AI settings are
        never included. Importing merges by id, then by name, and shows what will change first.
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={!currentProfileId || isExporting}
        >
          <Download className="h-4 w-4 mr-2" />
          Export project
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={!currentProfileId}
        >
          <Upload className="h-4 w-4 mr-2" />
          Import project
        </Button>
      </div>
      <ProjectFileInput inputRef={inputRef} onFile={setImportFile} />
      <ProjectImportDialog file={importFile} onClose={() => setImportFile(null)} />
    </div>
  );
}
