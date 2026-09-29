import { useDuckStore } from "@/store";
import { looksNumeric, type QueryParamsState } from "@/lib/sqlParams";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Variable } from "lucide-react";

interface QueryParamsBarProps {
  tabId: string;
  /** Placeholder names detected in the tab's SQL, in order. */
  names: string[];
  className?: string;
}

const EMPTY: QueryParamsState = { values: {} };

/**
 * One input per `$name` placeholder, above the results.
 *
 * Values are stored as typed text; the chip beside each shows how it will be
 * substituted (number inline, or quoted text) and toggles a numeric-looking
 * value to text for code-like columns. "Off" runs the SQL verbatim, for the
 * rare query that means `$name` literally.
 */
export default function QueryParamsBar({ tabId, names, className }: QueryParamsBarProps) {
  const params = useDuckStore((s) => s.tabs.find((tab) => tab.id === tabId)?.queryParams ?? EMPTY);
  const updateParams = useDuckStore((s) => s.updateTabQueryParams);

  if (names.length === 0) return null;

  if (params.disabled) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 border-b px-4 py-1.5 text-xs text-muted-foreground",
          className
        )}
      >
        <Variable className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          Parameters off — {names.map((name) => `$${name}`).join(", ")} run as written
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-2 text-xs"
          onClick={() => updateParams(tabId, (current) => ({ ...current, disabled: false }))}
        >
          Turn on
        </Button>
      </div>
    );
  }

  const forceText = new Set(params.forceText ?? []);

  const setValue = (name: string, value: string) =>
    updateParams(tabId, (current) => ({
      ...current,
      values: { ...current.values, [name]: value },
    }));

  const toggleText = (name: string) =>
    updateParams(tabId, (current) => {
      const forced = new Set(current.forceText ?? []);
      if (forced.has(name)) forced.delete(name);
      else forced.add(name);
      return { ...current, forceText: [...forced] };
    });

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-1.5",
        className
      )}
      aria-label="Query parameters"
    >
      <Variable className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {names.map((name) => {
        const value = params.values[name] ?? "";
        const numeric = looksNumeric(value);
        const asText = !numeric || forceText.has(name);
        return (
          <label key={name} className="flex items-center gap-1.5 text-xs">
            <span className="font-mono text-muted-foreground">${name}</span>
            <Input
              value={value}
              onChange={(event) => setValue(name, event.target.value)}
              placeholder="value"
              className={cn("h-6 w-32 px-2 text-xs", value === "" && "border-amber-500/60")}
              aria-label={`Value for $${name}`}
            />
            <button
              type="button"
              disabled={!numeric}
              onClick={() => toggleText(name)}
              className="rounded border px-1 font-mono text-[10px] leading-4 text-muted-foreground enabled:hover:bg-muted disabled:opacity-60"
              title={
                numeric
                  ? asText
                    ? "Substituted as quoted text — click to use as a number"
                    : "Substituted as a number — click to quote as text"
                  : "Substituted as quoted text"
              }
            >
              {asText ? "abc" : "123"}
            </button>
          </label>
        );
      })}
      <Button
        size="sm"
        variant="ghost"
        className="ml-auto h-6 px-2 text-xs text-muted-foreground"
        onClick={() => updateParams(tabId, (current) => ({ ...current, disabled: true }))}
        title="Run the SQL exactly as written, without substituting $name placeholders"
      >
        Turn off
      </Button>
    </div>
  );
}
