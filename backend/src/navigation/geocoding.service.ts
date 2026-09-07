import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ErrorCodes } from '../common/constants/error-codes';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { AppConfig } from '../config/app.config';
import { GeocodeResult } from './interfaces/routing-response.interface';

interface NominatimRow {
  display_name?: string;
  lat?: string;
  lon?: string;
}

/**
 * Place-name search behind a provider abstraction. Phase 1 uses OSM Nominatim
 * (free, no key); a commercial geocoder can be swapped via GEOCODING_API_URL.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  constructor(private readonly config: AppConfig) {}

  async search(query: string, limit: number): Promise<GeocodeResult[]> {
    switch (this.config.geocodingProvider.toLowerCase()) {
      case 'nominatim':
        return this.searchNominatim(query, limit);
      default:
        throw new ApiException(
          HttpStatus.SERVICE_UNAVAILABLE,
          `Geocoding provider "${this.config.geocodingProvider}" is not supported.`,
          ErrorCodes.GEOCODING_PROVIDER_UNSUPPORTED,
        );
    }
  }

  private async searchNominatim(
    query: string,
    limit: number,
  ): Promise<GeocodeResult[]> {
    const url = `${this.config.geocodingApiUrl}/search?format=jsonv2&addressdetails=1&limit=${limit}&q=${encodeURIComponent(query)}`;

    let rows: NominatimRow[];
    try {
      const res = await this.fetchWithTimeout(
        url,
        this.config.geocodingTimeoutMs,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      rows = (await res.json()) as NominatimRow[];
    } catch (err) {
      this.logger.warn(
        `Geocoding request failed for "${query}": ${String(err)}`,
      );
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'The search service is unavailable. Try again in a moment.',
        ErrorCodes.GEOCODING_UNAVAILABLE,
      );
    }

    return rows
      .filter(
        (row) =>
          typeof row.display_name === 'string' &&
          Number.isFinite(Number(row.lat)) &&
          Number.isFinite(Number(row.lon)),
      )
      .map((row) => ({
        name: row.display_name as string,
        latitude: Number(row.lat),
        longitude: Number(row.lon),
      }));
  }

  private async fetchWithTimeout(
    url: string,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          // Nominatim requires identifying the client.
          'User-Agent': 'RideTogether/1.0',
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
