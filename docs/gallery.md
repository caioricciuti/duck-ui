# Gallery

Runnable Duck-UI links. Each opens a live editor over a public dataset; the
opener sees what will load and what will run, and confirms once. Nothing is
sent to a server.

All examples use the DuckDB weather-stations sample
(`https://blobs.duckdb.org/stations.parquet`).

| What | Link |
|---|---|
| Stations per country | [open](https://duckui.com/?load=https://blobs.duckdb.org/stations.parquet&sql=SELECT%20country%2C%20count(*)%20AS%20stations%20FROM%20stations%20GROUP%20BY%20country%20ORDER%20BY%20stations%20DESC) |
| Column profile | [open](https://duckui.com/?load=https://blobs.duckdb.org/stations.parquet&sql=SUMMARIZE%20stations) |
| First 100 rows | [open](https://duckui.com/?load=https://blobs.duckdb.org/stations.parquet&sql=SELECT%20*%20FROM%20stations%20LIMIT%20100) |

## Add yours

1. Host the file with CORS enabled — see [hosting your data](hosting-data.md).
2. Build the link in the Share dialog (or by hand: `?load=<url>&sql=<url-encoded SQL>`).
3. Open a PR adding a row above: one line of description, dataset license if not public domain.

Keep queries fast (< 5 s on a laptop) and datasets under ~200 MB so the demo stays snappy.
