export interface MapProvider {
  id: string
  label: string
  url: string
  attribution: string
  maxZoom: number
}

/**
 * OpenStreetMap-compatible tile providers. The application is never hardcoded
 * to a single provider: set VITE_MAP_TILE_URL (+ attribution) to point the map
 * at any OSM-compatible tile server. Do not commit API keys.
 */
export const DEFAULT_TILE_PROVIDERS: MapProvider[] = [
  {
    id: 'dark',
    label: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19,
  },
  {
    id: 'light',
    label: 'Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19,
  },
  {
    id: 'standard',
    label: 'Standard',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
]

export function resolveTileProviders(): MapProvider[] {
  const customUrl = import.meta.env.VITE_MAP_TILE_URL as string | undefined
  if (customUrl && customUrl.trim() !== '') {
    return [
      {
        id: 'custom',
        label: 'Custom',
        url: customUrl.trim(),
        attribution: (import.meta.env.VITE_MAP_ATTRIBUTION as string | undefined) ?? '',
        maxZoom: Number(import.meta.env.VITE_MAP_MAX_ZOOM ?? 19) || 19,
      },
    ]
  }
  return DEFAULT_TILE_PROVIDERS
}
