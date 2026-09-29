#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  USAGE,
  buildLaunchUrl,
  createAppServer,
  listen,
  loadAppHeaders,
  openBrowser,
  parseArgs,
  registerFiles,
} from "./lib.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(packageRoot, "dist");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (!existsSync(path.join(distDir, "index.html"))) {
    throw new Error(`No built app found at ${distDir}. Run \`bun run build\` first.`);
  }

  const routes = registerFiles(options.files);
  const server = createAppServer({
    distDir,
    routes,
    headers: loadAppHeaders(path.join(packageRoot, "serve.json")),
  });
  const port = await listen(server, options.port, { tries: options.portExplicit ? 1 : 10 });
  const origin = `http://127.0.0.1:${port}`;
  const url = routes.size > 0 ? buildLaunchUrl(origin, routes.keys(), options.sql) : `${origin}/`;

  process.stdout.write(`Duck-UI running at ${origin}/\n`);
  for (const file of routes.values()) process.stdout.write(`  serving ${file}\n`);
  if (!options.open || !(await openBrowser(url))) {
    process.stdout.write(`Open ${url}\n`);
  }
  process.stdout.write("Press Ctrl+C to stop.\n");

  const stop = () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => {
  process.stderr.write(`duck-ui: ${error.message}\n`);
  process.exit(1);
});
