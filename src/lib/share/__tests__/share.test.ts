import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import {
  appRootUrl,
  encodeShare,
  decodeShare,
  tabToSharePayload,
  buildShareLinks,
  queryReadsRemoteSource,
  queryReproducesForViewers,
  type SharePayload,
} from "@/lib/share";
import type { EditorTab } from "@/store/types";

describe("share codec", () => {
  it("round-trips a sql payload", async () => {
    const payload: SharePayload = {
      v: 1,
      type: "sql",
      title: "Top trips",
      sql: "SELECT * FROM read_parquet('https://example.com/taxi.parquet') LIMIT 10",
      chartConfig: { type: "bar", xAxis: "day", yAxis: "trips" },
      autoRun: true,
    };
    const encoded = await encodeShare(payload);
    expect(typeof encoded).toBe("string");
    expect(encoded).not.toContain("=");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("+");

    const decoded = await decodeShare(encoded);
    expect(decoded).toEqual(payload);
  });

  it("round-trips a notebook payload", async () => {
    const payload: SharePayload = {
      v: 1,
      type: "notebook",
      title: "Analysis",
      cells: [
        { id: "a", type: "markdown", content: "# Hello" },
        { id: "b", type: "sql", content: "SELECT 1", result: null },
      ],
      autoRun: false,
    };
    const decoded = await decodeShare(await encodeShare(payload));
    expect(decoded).toEqual(payload);
  });

  it("preserves unicode in queries", async () => {
    const payload: SharePayload = {
      v: 1,
      type: "sql",
      title: "Café données 数据",
      sql: "SELECT 'café' AS café, '数据' AS 数据",
      autoRun: true,
    };
    const decoded = await decodeShare(await encodeShare(payload));
    expect(decoded?.sql).toBe(payload.sql);
    expect(decoded?.title).toBe(payload.title);
  });

  it("returns null for invalid input", async () => {
    expect(await decodeShare("not-a-valid-payload")).toBeNull();
    expect(await decodeShare("")).toBeNull();
  });

  it("maps a sql tab to a payload", () => {
    const tab: EditorTab = {
      id: "1",
      title: "Q1",
      type: "sql",
      content: "SELECT 42",
      chartConfig: { type: "line", xAxis: "x", yAxis: "y" },
    };
    const payload = tabToSharePayload(tab, true);
    expect(payload).toMatchObject({
      type: "sql",
      title: "Q1",
      sql: "SELECT 42",
      autoRun: true,
    });
    expect(payload?.chartConfig?.type).toBe("line");
  });

  it("strips cached notebook results when mapping", () => {
    const cells = [
      {
        id: "c1",
        type: "sql" as const,
        content: "SELECT 1",
        result: { columns: ["x"], columnTypes: ["INT"], data: [{ x: 1 }], rowCount: 1 },
      },
    ];
    const tab: EditorTab = {
      id: "2",
      title: "NB",
      type: "notebook",
      content: JSON.stringify(cells),
    };
    const payload = tabToSharePayload(tab);
    expect(payload?.type).toBe("notebook");
    expect(payload?.cells?.[0].result).toBeNull();
    expect(payload?.cells?.[0].content).toBe("SELECT 1");
  });

  it("returns null for non-shareable tab types", () => {
    const tab: EditorTab = { id: "h", title: "Home", type: "home", content: "" };
    expect(tabToSharePayload(tab)).toBeNull();
  });
});

describe("queryReadsRemoteSource", () => {
  it("detects remote/public sources", () => {
    expect(queryReadsRemoteSource("SELECT * FROM read_parquet('https://x/y.parquet')")).toBe(true);
    expect(queryReadsRemoteSource("SELECT * FROM 'https://x/y.csv'")).toBe(true);
    expect(queryReadsRemoteSource("SELECT * FROM read_csv('s3://bucket/a.csv')")).toBe(true);
    expect(queryReadsRemoteSource("SELECT * FROM read_json('gs://bucket/a.json')")).toBe(true);
  });

  it("treats local-table queries as non-remote", () => {
    expect(queryReadsRemoteSource("SELECT * FROM my_table")).toBe(false);
    expect(queryReadsRemoteSource("SELECT count(*) FROM sales GROUP BY region")).toBe(false);
  });
});

describe("queryReproducesForViewers", () => {
  it("accepts remote-source queries", () => {
    expect(queryReproducesForViewers("SELECT * FROM read_parquet('https://x/y.parquet')")).toBe(
      true
    );
  });

  it("accepts table-free queries", () => {
    expect(queryReproducesForViewers("SELECT 42 AS answer")).toBe(true);
    expect(queryReproducesForViewers("SELECT version()")).toBe(true);
  });

  it("rejects local-table queries", () => {
    expect(queryReproducesForViewers("SELECT * FROM my_table")).toBe(false);
    expect(queryReproducesForViewers("SELECT a FROM t1 JOIN t2 USING (id)")).toBe(false);
    expect(queryReproducesForViewers("SELECT * FROM generate_series(1, 10)")).toBe(false);
  });
});

describe("buildShareLinks", () => {
  // No jsdom in this project — stub the bits of window the URL builders read.
  beforeAll(() => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173", pathname: "/" } });
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("builds app, crawl, embed and iframe forms from one encode pass", async () => {
    const tab: EditorTab = {
      id: "1",
      title: 'Trips "2024"',
      type: "sql",
      content: "SELECT * FROM read_parquet('https://x/y.parquet')",
      chartConfig: { type: "bar", xAxis: "a", yAxis: "b" },
    };
    const links = await buildShareLinks(tab, true);
    expect(links).not.toBeNull();
    const origin = window.location.origin;
    expect(links!.appUrl.startsWith(`${origin}`)).toBe(true);
    expect(links!.appUrl).toContain("#s=");
    expect(links!.crawlUrl).toContain("/a/?s=");
    expect(links!.embedUrl.startsWith(`${origin}/embed#s=`)).toBe(true);
    // iframe points at the embed url and escapes quotes in the title
    expect(links!.iframeSnippet).toContain(`src="${links!.embedUrl}"`);
    expect(links!.iframeSnippet).toContain("&quot;2024&quot;");
    expect(links!.iframeSnippet).not.toContain('title="Trips "2024""');
    // web component snippet carries the cdn script + the encoded token
    const token = links!.embedUrl.split("#s=")[1];
    expect(links!.webComponentSnippet).toContain("@duck_ui/cdn");
    expect(links!.webComponentSnippet).toContain(`<duck-embed share="${token}">`);

    // every form decodes back to the same payload
    const param = links!.embedUrl.split("#s=")[1];
    const decoded = await decodeShare(param);
    expect(decoded?.sql).toBe(tab.content);
  });

  it("returns null for non-shareable tabs", async () => {
    const tab: EditorTab = { id: "h", title: "Home", type: "home", content: "" };
    expect(await buildShareLinks(tab)).toBeNull();
  });

  it("carries interactive params through the payload (v2)", async () => {
    const tab: EditorTab = {
      id: "1",
      title: "Sales",
      type: "sql",
      content: "SELECT region, revenue FROM read_csv('https://x/s.csv')",
    };
    const params = [
      { column: "region", type: "select" as const },
      { column: "revenue", type: "range" as const },
    ];
    const links = await buildShareLinks(tab, true, params);
    const token = links!.embedUrl.split("#s=")[1];
    const decoded = await decodeShare(token);
    expect(decoded?.v).toBe(2);
    expect(decoded?.params).toEqual(params);
  });

  it("omits params when none are selected", async () => {
    const tab: EditorTab = {
      id: "1",
      title: "Sales",
      type: "sql",
      content: "SELECT 1",
    };
    const payload = tabToSharePayload(tab, true, []);
    expect(payload?.params).toBeUndefined();
  });
});

describe("share links under a base path", () => {
  const tab: EditorTab = { id: "1", title: "Q", type: "sql", content: "SELECT 1" };

  beforeAll(() => {
    vi.stubGlobal("window", {
      location: { origin: "https://tools.example.com", pathname: "/duck-ui/" },
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("puts embed and crawl links under the base path", async () => {
    vi.stubEnv("BASE_URL", "/duck-ui/");
    const links = await buildShareLinks(tab);
    const token = links!.embedUrl.split("#s=")[1];

    expect(links!.embedUrl).toBe(`https://tools.example.com/duck-ui/embed#s=${token}`);
    expect(links!.crawlUrl).toBe(`https://tools.example.com/duck-ui/a/?s=${token}`);
    expect(links!.appUrl).toBe(`https://tools.example.com/duck-ui/#s=${token}`);
    expect(links!.iframeSnippet).toContain(
      `src="https://tools.example.com/duck-ui/embed#s=${token}"`
    );
  });

  it("does not take the base from the page the link was made on", async () => {
    // Made while looking at a crawlable share link, /duck-ui/a/.
    vi.stubGlobal("window", {
      location: { origin: "https://tools.example.com", pathname: "/duck-ui/a/" },
    });
    vi.stubEnv("BASE_URL", "/duck-ui/");
    const links = await buildShareLinks(tab);
    expect(links!.embedUrl.startsWith("https://tools.example.com/duck-ui/embed#s=")).toBe(true);
    expect(links!.crawlUrl.startsWith("https://tools.example.com/duck-ui/a/?s=")).toBe(true);
  });

  it("accepts a base path without a trailing slash", () => {
    expect(appRootUrl("https://x.test", "/duck-ui")).toBe("https://x.test/duck-ui/");
    expect(appRootUrl("https://x.test", "/a/b/")).toBe("https://x.test/a/b/");
  });

  it("stays at the origin root for the default, relative and absolute bases", () => {
    expect(appRootUrl("https://x.test", "/")).toBe("https://x.test/");
    expect(appRootUrl("https://x.test", "./")).toBe("https://x.test/");
    expect(appRootUrl("https://x.test", "")).toBe("https://x.test/");
    expect(appRootUrl("https://x.test", "https://cdn.test/assets/")).toBe("https://x.test/");
    expect(appRootUrl("https://x.test", "//cdn.test/assets/")).toBe("https://x.test/");
  });
});
