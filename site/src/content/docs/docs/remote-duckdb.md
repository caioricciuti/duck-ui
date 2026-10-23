---
title: "Remote DuckDB (Quack)"
description: "Attach a DuckDB server to the in-browser engine and query it next to your local data"
---

Quack is DuckDB's own client-server protocol. It runs over plain HTTP, so the DuckDB engine inside your browser tab can talk to a DuckDB server directly. Duck-UI attaches the server's database as one more catalog: it shows up in the explorer, and a single query can join remote tables with local files and tables.

## Start a server

On the machine with the data, with DuckDB 1.5.2 or later:

```sql
INSTALL quack;
LOAD quack;
CALL quack_serve('quack:localhost', token := 'choose-a-long-token');
```

The server listens on `localhost:9494` and only accepts connections from the same machine. Keep the DuckDB process running for as long as you want to query it.

## Attach it in Duck-UI

1. Open **Data > Connections**
2. In **Remote DuckDB (Quack)**, click **Attach**. Or click **Add connection** and pick **Remote DuckDB (Quack)** as the connection type
3. Fill in a **Name** (how the database is called in SQL), the **Host** (`localhost:9494`) and the **Token**
4. Click **Attach**

The database appears in the explorer under the name you chose. Query it like any attached database:

```sql
SELECT * FROM remote.items;

-- Remote and local data in one query
SELECT o.*, c.segment
FROM remote.orders o
JOIN read_parquet('customers.parquet') c USING (customer_id);
```

Attachments are saved in your profile and attached again when Duck-UI starts. If a server is down at that moment, the attachment is marked **Failed** with DuckDB's message; fix the server and click the reconnect button.

## Security

- The token is stored encrypted in your browser, with the same key that protects saved connection credentials. It is never written into query history, shared links or project exports.
- Duck-UI hands the token to DuckDB as a secret scoped to the host, which DuckDB shows redacted. It is not readable through `duckdb_databases()` or `duckdb_secrets()`.
- Quack does not encrypt traffic by itself. Anything beyond `localhost` belongs behind a reverse proxy that terminates HTTPS, such as nginx or Caddy. A page served over HTTPS, like duckui.com, can reach a plain HTTP server only on `localhost`, and only in browsers that allow that (Chrome and Firefox do).
- Anyone who can reach the server with the token can run any SQL on it. Use a long random token.
- Live session guests cannot reach your attached databases: their SQL runs in a separate engine with no network access.

## Known limits

- On DuckDB 1.5.x, tables outside the `main` schema of the remote database are listed in the explorer but cannot be queried through the attachment. This is a limitation of the Quack client in that release.
- One attachment per host.
- Attachments live in the in-browser engine. They are not available while an OPFS or HTTP server connection is the active one.
