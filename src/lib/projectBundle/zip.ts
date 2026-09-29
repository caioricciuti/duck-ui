/**
 * The zip container for project bundles.
 *
 * `fflate` is imported on demand: exporting or importing a project is rare,
 * and the rest of the app should not pay for a compressor it never uses.
 */

/** Per-file ceiling on import. Bundles hold text; anything larger is not ours. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5000;

const WANTED = /(^|\/)(duck-ui\.json|(queries\/[^/]+\.sql)|((notebooks|dashboards)\/[^/]+\.md))$/i;

export async function zipBundle(files: Record<string, string>): Promise<Uint8Array> {
  const { zipSync, strToU8 } = await import("fflate");
  const entries = Object.fromEntries(
    Object.entries(files).map(([path, text]) => [path, strToU8(text)])
  );
  return zipSync(entries, { level: 6 });
}

export async function unzipBundle(data: Uint8Array): Promise<Record<string, string>> {
  const { unzipSync, strFromU8 } = await import("fflate");
  let seen = 0;
  const entries = unzipSync(data, {
    filter: (file) => {
      if (!WANTED.test(file.name) || file.name.includes("..")) return false;
      // macOS archive metadata mirrors every file as `__MACOSX/…/._name`.
      if (/(^|\/)(__MACOSX\/|\._)/.test(file.name)) return false;
      if (file.originalSize > MAX_FILE_BYTES) {
        throw new Error(`${file.name} is too large to be part of a project`);
      }
      if (++seen > MAX_FILES) throw new Error("This archive has too many files");
      return true;
    },
  });
  return Object.fromEntries(
    Object.entries(entries).map(([path, bytes]) => [path, strFromU8(bytes)])
  );
}
