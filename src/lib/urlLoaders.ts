import { flushAutoSave, leaveWithoutPrompt } from "@/store";
import { useDuckStore } from "@/store";
import * as toast from "@/lib/stores/toast.svelte";
import { getUiConfig } from "@/lib/appConfig";
import { parseDeepLink, type DeepLinkRequest } from "@/lib/deepLink";
import { decodeShare, readShareParam, clearShareHash, serializeShareCells } from "@/lib/share";

/**
 * Everything the app reads from its own URL, as plain functions. There is no
 * router: the path only decides between the full app and the embed viewer,
 * and the rest travels in the query string or the fragment.
 */

/** True when the current path is the chrome-free embed viewer. */
export function isEmbedPath(): boolean {
  return /\/embed\/?$/.test(window.location.pathname);
}

/** Drops the query string without reloading. The fragment stays. */
export function clearSearchParams(): void {
  const { origin, pathname, hash } = window.location;
  window.history.replaceState(null, "", `${origin}${pathname}${hash}`);
}

/**
 * The "Open in Duck-UI" request carried by the URL (`?load=<url>&sql=...`),
 * or null when there is none or this deployment does not accept them.
 */
export function readDeepLinkRequest(): DeepLinkRequest | null {
  // Kiosk publishers pin their own data; links can't add more there.
  if (getUiConfig().hideImport) return null;
  // No deep links inside iframes: an embedding page could overlay bait on
  // top of the confirm dialog (clickjacking), and embeds have their own
  // share-payload mechanism anyway.
  if (window.top !== window.self) return null;
  return parseDeepLink(new URLSearchParams(window.location.search));
}

// Module-level: the shell can mount more than once in a page's life (the
// profile gate resolving, a profile switch), and processing the URL once per
// mount would duplicate the shared tab.
let hasProcessedQueryFromURL = false;

/**
 * Loads an analysis from the URL. Call once the engine is initialized.
 *
 * Two formats are supported:
 *  - `#s=<payload>`: full-tab share (SQL or notebook + chart config), the
 *    rich format produced by the Share button. See `src/lib/share`.
 *  - `?query=<base64>&execute=true`: legacy query-only links.
 */
export function loadQueryFromURL(): void {
  if (hasProcessedQueryFromURL) return;
  const { isInitialized, createTab, executeQuery, updateTabChartConfig } = useDuckStore.getState();
  if (!isInitialized) return;

  const searchParams = new URLSearchParams(window.location.search);
  const shareParam = readShareParam();
  const queryParam = searchParams.get("query");
  if (!shareParam && !queryParam) return;

  hasProcessedQueryFromURL = true;
  console.debug("[share] processing analysis from URL");

  // Rich full-tab share takes precedence.
  if (shareParam) {
    void (async () => {
      const payload = await decodeShare(shareParam);
      clearShareHash();

      if (!payload) {
        toast.error("This shared link is invalid or corrupted.");
        return;
      }

      if (payload.type === "notebook") {
        const content = payload.cells ? serializeShareCells(payload.cells) : "";
        createTab("notebook", content, payload.title);
        toast.success("Shared notebook loaded");
        return;
      }

      const sql = payload.sql ?? "";
      const tabId = createTab("sql", sql, payload.title);
      if (payload.chartConfig && tabId) {
        updateTabChartConfig(tabId, payload.chartConfig);
      }
      toast.success("Shared analysis loaded");

      if (payload.autoRun && sql.trim() && tabId) {
        // Small delay to ensure the tab is mounted before executing.
        setTimeout(() => {
          executeQuery(sql, tabId).catch(() => {
            toast.error(
              "Couldn't run the shared query automatically. It may need data that isn't loaded yet."
            );
          });
        }, 100);
      }
    })();
    return;
  }

  // Legacy query-only link.
  try {
    const decodedQuery = atob(queryParam as string);
    if (!decodedQuery.trim()) {
      toast.error("Empty query in URL");
      return;
    }

    const tabId = createTab("sql", decodedQuery);
    toast.success("Query loaded from URL");

    if (searchParams.get("execute") === "true" && tabId) {
      setTimeout(() => {
        void executeQuery(decodedQuery, tabId);
      }, 100);
    }

    clearSearchParams();
  } catch (error) {
    console.error("Failed to decode query from URL:", error);
    toast.error("Failed to decode query from URL. Invalid base64 encoding.");
  }
}

/**
 * Generate a shareable URL with the query encoded in base64 (legacy format).
 * Prefer `buildTabShareUrl` from `src/lib/share` for full-tab shares.
 */
export function generateQueryURL(query: string, autoExecute = false): string {
  const params = new URLSearchParams();
  params.set("query", btoa(query));
  if (autoExecute) params.set("execute", "true");
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

/** Copy the shareable query URL to clipboard (legacy format). */
export async function copyQueryURL(query: string, autoExecute = false): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(generateQueryURL(query, autoExecute));
    return true;
  } catch (error) {
    console.error("Failed to copy URL to clipboard:", error);
    return false;
  }
}

/**
 * After a deploy, the auto-updating service worker purges the previous
 * build's precache; a mid-session lazy chunk load would then 404. Reload once
 * when a NEW worker replaces an existing one. The 2s-debounced workspace
 * auto-save makes this nearly lossless. The first-ever install also fires
 * controllerchange (clientsClaim), and reloading there would loop.
 */
export function reloadOnServiceWorkerUpdate(): void {
  if (!("serviceWorker" in navigator)) return;
  let hadController = !!navigator.serviceWorker.controller;
  let reloadingForNewVersion = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (reloadingForNewVersion) return;
    reloadingForNewVersion = true;
    // Stored first, so nothing is lost by reloading without asking.
    void flushAutoSave().finally(() => {
      leaveWithoutPrompt();
      window.location.reload();
    });
  });
}
