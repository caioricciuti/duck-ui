---
title: "Dashboards"
description: "Markdown documents with live SQL, charts, and input variables, rendered entirely in your browser"
---

Dashboards in Duck-UI are **markdown documents with live SQL inside**. You write text, declare named queries in code fences, and place components that bind to those queries by name. The document renders as a report, the queries run in your browser against your data, and nothing ever touches a server.

If you have used Evidence, the syntax will feel familiar on purpose. If you have used Grafana, the input variables will.

## Creating a dashboard

Three ways in:

1. **Dashboards page** (Library group in the left rail, or `⌘K` and type its name): type a name, click **New**. The dashboard opens with a starter document that already works.
2. **Add to dashboard** from any query result in a SQL tab: the query and a table component are appended to the dashboard you pick (or a new one).
3. **Open a shared link** someone sent you (see [Sharing](#sharing) below).

Dashboards are saved automatically to your browser's storage, per profile. They survive reloads and browser restarts, and they show up on the Dashboards page as a list. Each one opens as a tab in the workspace.

## Anatomy of a document

````markdown
---
title: Sales overview
---

# Q3 sales

Revenue keeps climbing:

```sql revenue
SELECT region, sum(amount) AS total
FROM sales
GROUP BY region
ORDER BY total DESC
```

<BarChart data={revenue} x=region y=total/>

The winner is {revenue[0].region} with {revenue[0].total}.
````

Three building blocks:

- **Named SQL fences**: a fenced code block whose info line is `sql` plus a name (`` ```sql revenue ``). The name must be a valid identifier. Every fence runs against the dashboard's connection, and components reference the result by that name.
- **Components**: self-closing tags like `<BarChart data={revenue} x=region y=total/>`. Unknown tags render their raw source instead of breaking the page, so a typo is visible, not fatal.
- **Interpolation**: `{query_name[0].column}` inside text inserts a single value from a result. It is a lookup, not an expression language: no code runs from a document.

A component tag written inside backticks or a code fence is documentation, not a live component. That is how this page shows them without rendering them.

## Editing

Open a dashboard and click **Edit** for a split view: markdown source on the left, the live document on the right. The preview re-renders as you type, and only the queries whose SQL actually changed re-run.

The editor knows the dialect:

- Type `<` to get a component list. Accepting one inserts a working scaffold with tab-through placeholders (`data={…}`, `x=`, `y=`), not just the tag name.
- Inside `data={` you get the names of the queries declared in this document.
- Inside an open tag you get that component's props.
- Type `${` inside a SQL fence to get the input variables declared in the document (`inputs.region.value`, `inputs.period.start`, and so on).
- Snippets scaffold a named `sql` fence and the frontmatter block.

`Ctrl+Space` opens suggestions anywhere.

Click **Done** to go back to the full-width report. **Refresh all** re-runs every query, and the auto-refresh selector next to it re-runs them on a schedule (30s to 1h, paused while the tab is hidden). A `?refresh=<seconds>` parameter on a dashboard link sets the interval for that visit.

## Components

### Charts

All charts bind the same way: `data={query_name}` plus column props.

| Tag | Renders | Notes |
|-----|---------|-------|
| `<LineChart/>` | line | `x`, `y`, optional `series` for one line per category |
| `<TimeSeries/>` | line | alias of LineChart |
| `<Sparkline/>` | line | compact, no axes |
| `<BarChart/>` | bars | `x`, `y`, optional `series`; `type=stacked` or `type=grouped` |
| `<Histogram/>` | bars | alias of BarChart |
| `<AreaChart/>` | area | filled line; `type=stacked` or a `series` stacks |
| `<ScatterPlot/>` | scatter | two numeric axes |
| `<BubbleChart/>` | scatter | drawn as a scatter plot in this version, no size encoding |
| `<PieChart/>` | pie | `x` labels, `y` values |
| `<DonutChart/>` | donut | pie with a hole |
| `<FunnelChart/>` | bars | drawn as a bar chart in this version |
| `<BoxPlot/>` | box plot | `x` categories, `y` raw values; see below |
| `<Heatmap/>` | heatmap | `x` and `y` categories, `value` the number; see below |

Common props: `x`, `y`, `series` (split into one series per distinct value), `title` (drawn as a caption). Without `y`, the first numeric column is used.

````markdown
```sql by_region
SELECT region, month, sum(amount) AS total FROM sales GROUP BY 1, 2
```

<LineChart data={by_region} x=month y=total series=region title='Monthly by region'/>
````

#### Box plots

`<BoxPlot data={q} x=category y=value/>` draws one box per distinct `x`, from the raw values of `y`, so the query returns one row per observation rather than pre-computed quartiles. Quartiles are interpolated the way DuckDB's `quantile_cont` does it. Whiskers reach the furthest value within 1.5 times the box height (the interquartile range); values beyond are drawn as dots. Without `x` the whole column is one box; without `y` the first numeric column that is not `x` is used. Hover a box for n, min, quartiles and max.

#### Heatmaps

`<Heatmap data={q} x=hour y=day value=total/>` draws a grid of `value` by the categories of `x` and `y`. Rows that share a pair are summed and missing pairs stay empty. The color runs from the background to the accent, with the range in a legend below. Without `value` the first numeric column that is neither `x` nor `y` is used. Up to 50 categories per axis are drawn; past that the chart says so, and filtering or grouping the query brings the rest in.

````markdown
```sql activity
SELECT dayname(ts) AS day, hour(ts) AS hour, count(*) AS events FROM events GROUP BY 1, 2
```

<Heatmap data={activity} x=hour y=day value=events title='Events by hour'/>
````

### Tables and values

| Tag | What it does |
|-----|--------------|
| `<DataTable data={q}/>` | full result table with sorting and filtering |
| `<BigValue data={q} column=total agg=sum title='Revenue'/>` | one headline number |
| `<Value data={q} value=total/>` | a value inline in a sentence |
| `<Delta data={q} column=growth/>` | change indicator, colored up/down |
| `<DownloadData data={q} title='Download CSV'/>` | CSV download button |

Aggregations for `agg`: `sum`, `avg`, `min`, `max`, `count`, `first`.

### Layout

| Tag | What it does |
|-----|--------------|
| `<Grid cols=2>…</Grid>` | side-by-side layout for whatever is inside |
| `<Details title='Methodology'>…</Details>` | collapsible section |
| `<Alert status=warning>…</Alert>` | callout box (`info`, `warning`, `error`, `success`) |
| `<LinkButton url='https://…' title='Open'/>` | link styled as a button |

## Input variables

Inputs turn a static report into an interactive one, Grafana-style. Declare an input component in the document, then read its value in SQL with `${inputs.name.value}`:

````markdown
<Dropdown name=region options='north,south,east' title='Region'/>

```sql filtered
SELECT * FROM sales WHERE region = ${inputs.region.value}
```

<DataTable data={filtered}/>
````

Changing the dropdown re-runs **only** the queries that reference it. Values are substituted as **escaped SQL literals** before execution, so a document's inputs cannot inject SQL.

| Tag | Value | Reads as |
|-----|-------|----------|
| `<Dropdown name=x options='a,b,c'/>` | one of the options | `${inputs.x.value}` |
| `<ButtonGroup name=x options='a,b,c'/>` | one of the options | `${inputs.x.value}` |
| `<TextInput name=x/>` | free text | `${inputs.x.value}` |
| `<DateInput name=x/>` / `<DatePicker name=x/>` | a date | `${inputs.x.value}` |
| `<DateRange name=x/>` | two dates | `${inputs.x.start}` and `${inputs.x.end}` |
| `<Slider name=x min=0 max=100 step=1/>` | a number | `${inputs.x.value}` |
| `<Checkbox name=x/>` | true/false | `${inputs.x.value}` |

Dropdowns can also be query-backed: `<Dropdown name=region data={regions} value=region_name/>` builds its options from a query result.

Every input has a default, so every query can run before anyone touches anything.

## Execution and caching

Queries run on the dashboard's connection (your in-browser DuckDB by default). Results are cached by the final SQL text, so:

- two components bound to the same query share one execution,
- editing one query re-runs only that query,
- changing an input re-runs only the queries that reference that input.

Query results stay in your browser. They are never part of the document, never synced, never in a share link.

## Sharing

The **Share** button on a dashboard offers two links, and a live session offers a third mode:

| Mode | What the recipient gets | Enforcement |
|------|------------------------|-------------|
| **Viewer link** | the document opens read-only | a workflow signal, not a lock: the source is in their browser, and they can save an editable copy deliberately |
| **Editor link** | the document imports as an editable copy in their profile | their copy, their storage |
| **Live session** | real-time co-editing with cursors, host compute | enforceable: the host can revoke at any time |

Share links carry the **source only**: markdown and SQL, never results, never credentials. The payload travels in the URL fragment (`#dash=…`), which browsers do not send to servers, so your SQL stays out of access logs.

One honest caveat: a shared document's queries reproduce for the recipient only if the data they read is reachable from the recipient's browser (remote parquet/CSV yes, your locally imported tables no). Pair a share with a [live session](/docs/live-sessions) or a fork when the data has to travel too.

## Co-editing in live sessions

Any dashboard open during a [live session](/docs/live-sessions) becomes co-editable: everyone in the session edits the same source with character-level merging and visible cursors, and participants who just view it see the report re-render live as others type.
