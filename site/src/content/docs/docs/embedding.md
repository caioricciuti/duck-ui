---
title: "Embedding"
description: "Embed a live, queryable DuckDB analysis on any page: one line, no backend, data never leaves the viewer's browser."
---

Any analysis you build in Duck-UI can be turned into a **live, read-only widget** you paste into any page. It runs entirely in the viewer's browser: no server, no API key, no signup, and the data never leaves their machine.

In the SQL editor, click **Share**, then the **Embed** tab, to copy a ready-made snippet, or build one from a share link yourself.

## The iframe

It works in any HTML page, and in tools like Notion, Ghost, and WordPress that allow iframe embeds.

```html
<iframe
  src="https://duckui.com/embed#s=PASTE_SHARE_TOKEN"
  width="100%"
  height="480"
  style="border:0;border-radius:8px"
  title="My analysis"
></iframe>
```

The iframe is served from `duckui.com`, which sets the `COOP`/`COEP` headers DuckDB-WASM needs, so it works even on host pages that can't set those headers themselves.

## Interactive filters

An embed can be **interactive**, not just a static chart. In the Share dialog's **Embed** tab, under **Interactive filters**, pick result columns to expose as controls:

- **Dropdown**: a select of the column's distinct values.
- **Search**: free-text "contains" matching.
- **Range**: numeric min/max inputs.

Viewers change a filter and the embed re-runs the query live in their browser, the perfect "fork and tweak" moment. Filters are wrapped around your query automatically, so they work with JOINs and CTEs too. (Filtering applies to columns present in the query's result.)

## The one rule: read from a URL, not a local file

A share link carries the **query, not the data**. That's what keeps it backend-free and private.

- ✅ Queries that read from a URL reproduce for everyone:
  ```sql
  SELECT month, avg(temp_max)
  FROM read_parquet('https://example.com/weather.parquet')
  GROUP BY month;
  ```
- ⚠️ Queries that read a **locally-imported** table (a CSV you dragged in) will **not** reproduce in an embed; the viewer doesn't have that file. The embed shows a clear "this analysis needs data that isn't public" message instead of breaking.

To make a shareable/embeddable analysis, point your query at a public URL (`read_parquet`, `read_csv`, `read_json`) or an object-store path (`s3://`, `gs://`, …).

## How it works

1. Your query and chart config are gzipped and base64url-encoded into the share token, entirely client-side. Nothing is uploaded.
2. The embed decodes the token, spins up DuckDB-WASM in the viewer's browser, loads `httpfs`, runs the query, and renders the chart (or a table).
3. A "Powered by Duck-UI · Open in Duck-UI" footer links back to the full editor, where anyone can fork and tweak the analysis.
