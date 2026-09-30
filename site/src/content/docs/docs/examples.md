---
title: "Examples"
description: "Runnable Duck-UI analyses over public datasets, one click each."
---

Each link opens Duck-UI with a public dataset and a query. You see what will load and what will run, and confirm once. The data goes straight from its host to your browser; nothing passes through a server of ours.

| Analysis | Link |
|---|---|
| Seattle weather: average high by month | [open](https://duckui.com/?load=https://raw.githubusercontent.com/vega/vega-datasets/main/data/seattle-weather.csv&sql=SELECT%20month%28%22date%22%29%20AS%20month%2C%20ROUND%28AVG%28temp_max%29%2C%201%29%20AS%20avg_high_c%20FROM%20seattle_weather%20GROUP%20BY%20month%20ORDER%20BY%20month) |
| Dutch train services: busiest stations | [open](https://duckui.com/?load=https://blobs.duckdb.org/train_services.parquet&sql=SELECT%20station_name%2C%20COUNT%28%2A%29%20AS%20stops%20FROM%20train_services%20GROUP%20BY%20station_name%20ORDER%20BY%20stops%20DESC%20LIMIT%2015) |
| Train stations per country | [open](https://duckui.com/?load=https://blobs.duckdb.org/stations.parquet&sql=SELECT%20country%2C%20count%28%2A%29%20AS%20stations%20FROM%20stations%20GROUP%20BY%20country%20ORDER%20BY%20stations%20DESC) |
| Column profile of the stations table | [open](https://duckui.com/?load=https://blobs.duckdb.org/stations.parquet&sql=SUMMARIZE%20stations) |

## Make your own

Add `?load=` with the URL of a Parquet, CSV or JSON file (or a `.duckdb` database) to `https://duckui.com/`, and optionally `&sql=` with a query. The file becomes a view named after it: `stations.parquet` is `stations`. In the app, **Share**, then the **Badge** tab, builds the link and a README badge for you.

The host of the data has to allow cross-origin requests (CORS). Parquet on Cloudflare R2, GitHub Pages or a CORS-enabled bucket works.
