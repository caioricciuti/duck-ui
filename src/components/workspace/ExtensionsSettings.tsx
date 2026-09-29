import { useCallback, useEffect, useMemo, useState } from "react";
import { useDuckStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, Loader2, Play, Puzzle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  isUnavailableExtensionError,
  type ExtensionAction,
  type ExtensionInfo,
} from "@/lib/duckdbExtensions";

/**
 * Extension manager, as a Settings section. Lists `duckdb_extensions()` for
 * the active connection and runs INSTALL / LOAD through the store.
 *
 * DuckDB has no column for "exists for this platform", so availability is
 * learned rather than hardcoded: an extension whose INSTALL/LOAD comes back
 * as a missing binary is marked unavailable for the rest of this visit.
 */
export default function ExtensionsSettings() {
  const fetchExtensions = useDuckStore((s) => s.fetchExtensions);
  const runExtensionAction = useDuckStore((s) => s.runExtensionAction);
  const session = useDuckStore((s) => s.currentSession);
  const connectionName = useDuckStore((s) => s.currentConnection?.name);

  const [extensions, setExtensions] = useState<ExtensionInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pending, setPending] = useState<Record<string, ExtensionAction>>({});
  const [unavailable, setUnavailable] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState("");

  const readOnly = !!session?.capabilities.readonly;
  const isRemote = !!session?.capabilities.remote;

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      setExtensions(await fetchExtensions());
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to list extensions");
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchExtensions]);

  useEffect(() => {
    let cancelled = false;
    fetchExtensions()
      .then((list) => {
        if (!cancelled) setExtensions(list);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Failed to list extensions");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetchExtensions]);

  const handleAction = async (action: ExtensionAction, name: string) => {
    setPending((p) => ({ ...p, [name]: action }));
    try {
      await runExtensionAction(action, name);
      toast.success(`${action === "install" ? "Installed" : "Loaded"} ${name}`);
      setUnavailable((prev) => {
        if (!prev.has(name)) return prev;
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (isUnavailableExtensionError(message)) {
        setUnavailable((prev) => new Set(prev).add(name));
      }
      toast.error(`Failed to ${action} ${name}`, { description: message });
    } finally {
      setPending((p) => {
        const next = { ...p };
        delete next[name];
        return next;
      });
      await refresh();
    }
  };

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!extensions) return [];
    if (!needle) return extensions;
    return extensions.filter(
      (e) => e.name.toLowerCase().includes(needle) || e.description.toLowerCase().includes(needle)
    );
  }, [extensions, filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Puzzle className="h-4 w-4" />
            DuckDB extensions
          </h3>
          <p className="text-xs text-muted-foreground">
            Extensions available to{" "}
            <span className="font-medium">{connectionName ?? "the active connection"}</span>.
            {isRemote
              ? " They install on the remote server."
              : " In the browser they download from extensions.duckdb.org, so installing needs a network connection the first time. Not every extension is built for WASM."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={isRefreshing}
          aria-label="Refresh extension list"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {readOnly && (
        <Alert>
          <AlertDescription className="text-xs">
            This connection is read-only, so extensions can be listed but not installed or loaded.
          </AlertDescription>
        </Alert>
      )}

      {loadError && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">{loadError}</AlertDescription>
        </Alert>
      )}

      {extensions === null && !loadError ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading extensions…
        </div>
      ) : (
        extensions && (
          <>
            <Input
              placeholder="Filter extensions…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="divide-y rounded-md border">
              {visible.map((ext) => {
                const busy = pending[ext.name];
                const isUnavailable = unavailable.has(ext.name);
                return (
                  <div key={ext.name} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-sm">{ext.name}</span>
                        {ext.loaded && <Badge className="text-[10px] px-1.5 py-0">Loaded</Badge>}
                        {ext.installed && !ext.loaded && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Installed
                          </Badge>
                        )}
                        {isUnavailable && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 text-amber-600 dark:text-amber-400"
                            title="The extension repository has no build of this extension for this platform"
                          >
                            {isRemote ? "Unavailable" : "Not available in WASM"}
                          </Badge>
                        )}
                      </div>
                      {ext.description && (
                        <p
                          className="text-xs text-muted-foreground truncate"
                          title={ext.description}
                        >
                          {ext.description}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {!ext.installed && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={readOnly || !!busy}
                          onClick={() => handleAction("install", ext.name)}
                        >
                          {busy === "install" ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5 mr-1" />
                          )}
                          Install
                        </Button>
                      )}
                      {!ext.loaded && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={readOnly || !!busy}
                          onClick={() => handleAction("load", ext.name)}
                        >
                          {busy === "load" ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5 mr-1" />
                          )}
                          Load
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              {visible.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No extensions match “{filter}”.
                </p>
              )}
            </div>
          </>
        )
      )}
    </div>
  );
}
