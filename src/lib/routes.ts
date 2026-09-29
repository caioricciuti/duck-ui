import {
  Bookmark,
  Cable,
  History,
  Library,
  Puzzle,
  Settings,
  SquareTerminal,
  Database,
} from "lucide-svelte";
import { getUiConfig, type UiConfig } from "@/lib/appConfig";

export type PageRoute = "saved-queries" | "history" | "connections" | "extensions" | "settings";
export type Route = "workspace" | PageRoute;
export type NavGroupId = "query" | "library" | "data" | "settings";

type Icon = typeof Settings;

export interface PageMeta {
  label: string;
  description: string;
  icon: Icon;
  /** Kiosk flag that removes the page when set. */
  hiddenBy?: keyof UiConfig;
}

export interface PageSection {
  id: string;
  label: string;
}

export interface NavGroup {
  id: NavGroupId;
  label: string;
  icon: Icon;
  routes: PageRoute[];
}

export const PAGE_ROUTES: Record<PageRoute, PageMeta> = {
  "saved-queries": {
    label: "Saved queries",
    description: "Queries you kept for later",
    icon: Bookmark,
  },
  history: {
    label: "History",
    description: "What ran in this session and before",
    icon: History,
  },
  connections: {
    label: "Connections",
    description: "DuckDB servers and browser databases this profile can query",
    icon: Cable,
    hiddenBy: "hideConnections",
  },
  extensions: {
    label: "Extensions",
    description: "DuckDB extensions for the active connection",
    icon: Puzzle,
    hiddenBy: "hideSettings",
  },
  settings: {
    label: "Settings",
    description: "Profile, AI provider and engine preferences for this browser",
    icon: Settings,
    hiddenBy: "hideSettings",
  },
};

export const PAGE_SECTIONS: Partial<Record<PageRoute, PageSection[]>> = {
  settings: [
    { id: "profile", label: "Profile" },
    { id: "general", label: "General" },
    { id: "ai", label: "AI" },
    { id: "performance", label: "Performance" },
    { id: "project", label: "Project" },
  ],
};

export const NAV_GROUPS: NavGroup[] = [
  { id: "query", label: "Query", icon: SquareTerminal, routes: [] },
  { id: "library", label: "Library", icon: Library, routes: ["saved-queries", "history"] },
  { id: "data", label: "Data", icon: Database, routes: ["connections", "extensions"] },
  { id: "settings", label: "Settings", icon: Settings, routes: ["settings"] },
];

export const isPageRoute = (value: string | null): value is PageRoute =>
  value !== null && value in PAGE_ROUTES;

export function isRouteVisible(route: PageRoute): boolean {
  const flag = PAGE_ROUTES[route].hiddenBy;
  return !flag || !getUiConfig()[flag];
}

export function visibleRoutes(group: NavGroup): PageRoute[] {
  return group.routes.filter(isRouteVisible);
}

export function groupForRoute(route: Route): NavGroup {
  return NAV_GROUPS.find((g) => g.routes.includes(route as PageRoute)) ?? NAV_GROUPS[0];
}

export function sectionsFor(route: Route): PageSection[] {
  return route === "workspace" ? [] : (PAGE_SECTIONS[route] ?? []);
}
