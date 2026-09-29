import { isPageRoute, isRouteVisible, sectionsFor, type PageRoute, type Route } from "@/lib/routes";
import { registerPageOpener } from "@/lib/pageNavigation";

/**
 * The route lives in the query string (`?page=settings&section=ai`), not in
 * the path. Duck-UI is served as static files, often from a sub-path and
 * without a server rewrite, and a query string survives a reload everywhere.
 * Share and session links keep using the hash and other parameters, so both
 * are carried along untouched.
 */
const PAGE_PARAM = "page";
const SECTION_PARAM = "section";

function read(): { route: Route; section: string | null } {
  const params = new URLSearchParams(window.location.search);
  const page = params.get(PAGE_PARAM);
  if (!isPageRoute(page) || !isRouteVisible(page)) return { route: "workspace", section: null };
  const wanted = params.get(SECTION_PARAM);
  const sections = sectionsFor(page);
  const section = sections.find((s) => s.id === wanted)?.id ?? sections[0]?.id ?? null;
  return { route: page, section };
}

const initial = read();
let route = $state<Route>(initial.route);
let section = $state<string | null>(initial.section);

function write(nextRoute: Route, nextSection: string | null, replace = false): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(PAGE_PARAM);
  url.searchParams.delete(SECTION_PARAM);
  if (nextRoute !== "workspace") {
    url.searchParams.set(PAGE_PARAM, nextRoute);
    // The first section is the default, so it stays out of the URL.
    if (nextSection && nextSection !== sectionsFor(nextRoute)[0]?.id) {
      url.searchParams.set(SECTION_PARAM, nextSection);
    }
  }
  if (url.href === window.location.href) return;
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
}

export function getRoute(): Route {
  return route;
}

export function getSection(): string | null {
  return section;
}

export function isOnWorkspace(): boolean {
  return route === "workspace";
}

export function goTo(next: PageRoute, nextSection?: string): void {
  if (!isRouteVisible(next)) return;
  const sections = sectionsFor(next);
  const resolved = sections.find((s) => s.id === nextSection)?.id ?? sections[0]?.id ?? null;
  route = next;
  section = resolved;
  write(next, resolved);
}

export function goWorkspace(): void {
  route = "workspace";
  section = null;
  write("workspace", null);
}

export function initRouter(): () => void {
  const onPopState = () => {
    const next = read();
    route = next.route;
    section = next.section;
  };
  window.addEventListener("popstate", onPopState);
  registerPageOpener((page) => goTo(page));
  return () => window.removeEventListener("popstate", onPopState);
}
