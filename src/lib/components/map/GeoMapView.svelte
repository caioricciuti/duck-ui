<script lang="ts" module>
  /**
   * Map view for results with a GEOMETRY column.
   *
   * maplibre-gl (~1 MB) is imported on first use only, so it never enters the
   * main bundle. The basemap is OpenStreetMap's raster tiles, no API key, and
   * is optional: offline, or when tiles fail before any has loaded, the map
   * drops to a plain background and still draws the data.
   */
  import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
  import type { FeatureProperties } from '@/lib/geoResult'

  type MapLibre = typeof import('maplibre-gl')

  const SOURCE_ID = 'result'
  const BASEMAP_ID = 'basemap'
  const RESULT_LAYERS = ['result-fill', 'result-line', 'result-point']

  /** Tile host. Covered by the existing CSP (img-src/connect-src allow https:). */
  const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  const OSM_ATTRIBUTION =
    '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'

  let maplibrePromise: Promise<MapLibre> | null = null

  /** Loads maplibre and its worker once, on first map render. */
  function loadMapLibre(): Promise<MapLibre> {
    maplibrePromise ??= Promise.all([
      import('maplibre-gl'),
      // Bundled by Vite as a standalone worker file; maplibre's own lookup
      // (relative to import.meta.url) doesn't survive bundling.
      import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
    ])
      .then(([lib, worker]) => {
        lib.setWorkerUrl(worker.default)
        return lib
      })
      .catch((error: unknown) => {
        maplibrePromise = null // let a later render retry (e.g. chunk fetch failed offline)
        throw error
      })
    return maplibrePromise
  }

  /** Popup body built from DOM nodes, never HTML strings: values are user data. */
  function buildPopup(properties: FeatureProperties): HTMLElement {
    const table = document.createElement('table')
    table.className = 'text-xs'
    for (const [key, value] of Object.entries(properties).slice(0, 20)) {
      const row = table.insertRow()
      const k = row.insertCell()
      k.textContent = key
      k.className = 'pr-2 font-medium align-top text-fg-3'
      const v = row.insertCell()
      v.textContent = value === null ? 'NULL' : String(value)
      v.className = 'break-all text-fg'
    }
    return table
  }
</script>

<script lang="ts">
  // Imported here, not in app.css, so the stylesheet ships with the map chunk.
  import 'maplibre-gl/dist/maplibre-gl.css'
  import { MapPinOff, TriangleAlert } from 'lucide-svelte'
  import { resultToGeoJson } from '@/lib/geoResult'
  import type { QueryResult } from '@/store/types'
  import { getTheme } from '../../stores/theme.svelte'
  import { themeColor } from '../charts/palette'
  import Select from '../common/Select.svelte'
  import Spinner from '../common/Spinner.svelte'

  interface Props {
    result: QueryResult
    geometryColumns: string[]
  }

  let { result, geometryColumns }: Props = $props()

  let container = $state<HTMLDivElement | null>(null)
  let map: MapLibreMap | null = null
  let selectedColumn = $state<string | undefined>(undefined)
  let mapReady = $state(false)
  let mapError = $state<string | null>(null)
  let basemapOff = $state(false)

  const column = $derived(
    selectedColumn && geometryColumns.includes(selectedColumn) ? selectedColumn : geometryColumns[0]
  )
  const conversion = $derived(resultToGeoJson(result.data, column))
  const featureCount = $derived(conversion.collection.features.length)

  function buildStyle(dark: boolean, withBasemap: boolean): StyleSpecification {
    return {
      version: 8,
      sources: withBasemap
        ? {
            [BASEMAP_ID]: {
              type: 'raster',
              tiles: [OSM_TILES],
              tileSize: 256,
              maxzoom: 19,
              attribution: OSM_ATTRIBUTION,
            },
          }
        : {},
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': themeColor('--surface-2') },
        },
        ...(withBasemap
          ? [
              {
                id: BASEMAP_ID,
                type: 'raster' as const,
                source: BASEMAP_ID,
                // Dim the light OSM style in dark mode instead of loading a second tileset.
                paint: dark
                  ? { 'raster-brightness-max': 0.55, 'raster-saturation': -0.6 }
                  : { 'raster-saturation': -0.2 },
              },
            ]
          : []),
      ],
    }
  }

  // Create the map once per theme; data updates go through setData below.
  $effect(() => {
    const dark = getTheme() === 'dark'
    const el = container
    if (!el) return
    let cancelled = false
    let resizeObserver: ResizeObserver | null = null
    const withBasemap = typeof navigator === 'undefined' || navigator.onLine !== false
    // WebGL paint values cannot be CSS variables: resolve the tokens now.
    const accent = themeColor('--accent')
    const pointRing = themeColor('--surface')

    loadMapLibre()
      .then((maplibre) => {
        if (cancelled) return
        const instance = new maplibre.Map({
          container: el,
          style: buildStyle(dark, withBasemap),
          center: [0, 20],
          zoom: 1,
          attributionControl: { compact: true },
        })
        map = instance
        instance.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right')

        let tileLoaded = false
        instance.on('sourcedata', (e) => {
          if (e.sourceId === BASEMAP_ID && e.tile) tileLoaded = true
        })
        instance.on('error', (e) => {
          const sourceId = (e as { sourceId?: string }).sourceId
          // A basemap that never produced a tile is unreachable (offline,
          // blocked host): fall back to the plain background.
          if (sourceId === BASEMAP_ID && !tileLoaded && instance.getLayer(BASEMAP_ID)) {
            instance.setLayoutProperty(BASEMAP_ID, 'visibility', 'none')
            basemapOff = true
          }
        })
        if (!withBasemap) basemapOff = true

        instance.on('load', () => {
          instance.addSource(SOURCE_ID, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          })
          instance.addLayer({
            id: 'result-fill',
            type: 'fill',
            source: SOURCE_ID,
            filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
            paint: { 'fill-color': accent, 'fill-opacity': 0.3 },
          })
          instance.addLayer({
            id: 'result-line',
            type: 'line',
            source: SOURCE_ID,
            filter: ['!', ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]]],
            paint: { 'line-color': accent, 'line-width': 1.5 },
          })
          instance.addLayer({
            id: 'result-point',
            type: 'circle',
            source: SOURCE_ID,
            filter: ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]],
            paint: {
              'circle-color': accent,
              'circle-radius': 4,
              'circle-stroke-color': pointRing,
              'circle-stroke-width': 1,
            },
          })

          for (const layer of RESULT_LAYERS) {
            instance.on('click', layer, (e) => {
              const feature = e.features?.[0]
              if (!feature) return
              new maplibre.Popup({ maxWidth: '320px' })
                .setLngLat(e.lngLat)
                .setDOMContent(buildPopup(feature.properties as FeatureProperties))
                .addTo(instance)
            })
            instance.on('mouseenter', layer, () => (instance.getCanvas().style.cursor = 'pointer'))
            instance.on('mouseleave', layer, () => (instance.getCanvas().style.cursor = ''))
          }
          mapReady = true
        })

        resizeObserver = new ResizeObserver(() => instance.resize())
        resizeObserver.observe(el)
      })
      .catch((error: unknown) => {
        if (!cancelled) mapError = error instanceof Error ? error.message : 'Failed to load the map'
      })

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      map?.remove()
      map = null
      mapReady = false
      basemapOff = false
    }
  })

  // Push data and frame it whenever the result or chosen column changes.
  $effect(() => {
    const { collection, bounds } = conversion
    if (!mapReady || !map) return
    const source = map.getSource<GeoJSONSource>(SOURCE_ID)
    // Our GeoJSON types are structurally identical to maplibre's.
    source?.setData(collection as Parameters<GeoJSONSource['setData']>[0])
    if (!bounds) return
    const [minLon, minLat, maxLon, maxLat] = bounds
    if (minLon === maxLon && minLat === maxLat) {
      map.jumpTo({ center: [minLon, minLat], zoom: 12 })
    } else {
      map.fitBounds(
        [
          [minLon, minLat],
          [maxLon, maxLat],
        ],
        { padding: 40, maxZoom: 16, duration: 0 }
      )
    }
  })
</script>

<div class="geo-map flex h-full flex-col">
  <div class="flex items-center gap-3 border-b border-edge-subtle px-3 py-1.5 text-xs text-fg-3">
    {#if geometryColumns.length > 1}
      <label class="sr-only" for="geo-column">Geometry column</label>
      <Select
        id="geo-column"
        size="sm"
        class="w-48"
        value={column}
        options={geometryColumns.map((name) => ({ value: name, label: name }))}
        onchange={(value) => (selectedColumn = value)}
      />
    {:else}
      <span class="font-mono">{column}</span>
    {/if}
    <span>{featureCount.toLocaleString()} {featureCount === 1 ? 'feature' : 'features'}</span>
    {#if conversion.skipped > 0}
      <span
        class="flex items-center gap-1 text-warning"
        title="Rows whose geometry couldn't be parsed, was too large to decode, or isn't in lon/lat (try ST_Transform to EPSG:4326)"
      >
        <TriangleAlert size={13} />
        {conversion.skipped.toLocaleString()} not drawn
      </span>
    {/if}
    {#if result.truncated}
      <span>first {result.rowCount.toLocaleString()} rows</span>
    {/if}
    {#if basemapOff}
      <span class="ml-auto">Basemap unavailable, offline view</span>
    {/if}
  </div>
  <div class="relative min-h-0 flex-1">
    <div bind:this={container} class="map-canvas absolute inset-0"></div>
    {#if mapError}
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
        <MapPinOff size={28} class="text-fg-3" />
        <p class="text-[13px] text-fg">The map couldn't be displayed.</p>
        <p class="max-w-md text-xs text-fg-3">{mapError}</p>
      </div>
    {:else if !mapReady}
      <div class="absolute inset-0 flex items-center justify-center gap-2 text-[13px] text-fg-3" role="status">
        <Spinner size="sm" />
        Loading map…
      </div>
    {/if}
  </div>
</div>

<style>
  /* maplibre's stylesheet sets position: relative on the container and, being
     unlayered, beats Tailwind's layered utilities. Left to it, the map is 0 px
     tall and shows nothing. */
  .map-canvas {
    position: absolute;
  }
  /* maplibre builds its popups and controls itself and ships them on a white
     ground. These put them on the app's surfaces. */
  .geo-map :global(.maplibregl-popup-content) {
    padding: 8px 10px;
    border: 1px solid var(--edge);
    border-radius: var(--radius-lg);
    background: var(--elevated);
    color: var(--fg);
    box-shadow: var(--shadow-popover);
    font-family: var(--font-sans);
  }
  .geo-map :global(.maplibregl-popup-anchor-top .maplibregl-popup-tip),
  .geo-map :global(.maplibregl-popup-anchor-top-left .maplibregl-popup-tip),
  .geo-map :global(.maplibregl-popup-anchor-top-right .maplibregl-popup-tip) {
    border-bottom-color: var(--elevated);
  }
  .geo-map :global(.maplibregl-popup-anchor-bottom .maplibregl-popup-tip),
  .geo-map :global(.maplibregl-popup-anchor-bottom-left .maplibregl-popup-tip),
  .geo-map :global(.maplibregl-popup-anchor-bottom-right .maplibregl-popup-tip) {
    border-top-color: var(--elevated);
  }
  .geo-map :global(.maplibregl-popup-anchor-left .maplibregl-popup-tip) {
    border-right-color: var(--elevated);
  }
  .geo-map :global(.maplibregl-popup-anchor-right .maplibregl-popup-tip) {
    border-left-color: var(--elevated);
  }
  .geo-map :global(.maplibregl-popup-close-button) {
    color: var(--fg-3);
  }
</style>
