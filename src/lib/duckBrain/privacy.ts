import type { AIProviderType } from "./providers/types";

/**
 * Data-sharing rules for Duck Brain.
 *
 * The product promise is "only your schema is ever sent, never your data".
 * Any action that would send result rows must ask first, every time, unless
 * the model runs inside this browser tab.
 */

/** Providers whose inference never leaves the browser. */
const IN_BROWSER_PROVIDERS: ReadonlySet<string> = new Set<string>(["webllm"]);

export function isInBrowserProvider(provider: AIProviderType): boolean {
  return IN_BROWSER_PROVIDERS.has(provider);
}

/**
 * Sending result rows requires explicit consent for every provider that is
 * reached over the network, including a "local" OpenAI-compatible server:
 * its URL could just as well point at a remote host or a tunnel.
 */
export function requiresDataConsent(provider: AIProviderType): boolean {
  return !isInBrowserProvider(provider);
}

/** Human-readable name of where the data would go, for the consent dialog. */
export function describeProviderDestination(
  provider: AIProviderType,
  config?: { baseUrl?: string; modelId?: string }
): string {
  switch (provider) {
    case "webllm":
      return "the in-browser model";
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "openai-compatible": {
      const host = safeHost(config?.baseUrl);
      return host ? `the OpenAI-compatible server at ${host}` : "your OpenAI-compatible server";
    }
    default:
      return "the configured AI provider";
  }
}

function safeHost(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}
