import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { NavigationService } from './navigation.service';
import { CalculateRouteDto } from './dto/calculate-route.dto';
import { GeocodeQuery } from './dto/geocode-query.dto';

interface ThrottleConfig {
  limit: number;
  ttl: number;
}

/**
 * Route-scoped rate limits for the navigation endpoints. Tight (but
 * configurable) so accidental reroute loops — e.g. a flapping GPS fix — can't
 * hammer the routing engine. The global ThrottlerGuard still applies on top.
 */
function throttleLimit(env: string | undefined, fallback: number): number {
  const n = Number(env);
  return env && Number.isFinite(n) ? n : fallback;
}

const ROUTE_THROTTLE: ThrottleConfig = {
  limit: throttleLimit(process.env['NAVIGATION_ROUTE_THROTTLE_LIMIT'], 20),
  ttl: throttleLimit(process.env['NAVIGATION_ROUTE_THROTTLE_TTL_MS'], 60_000),
};

const GEOCODE_THROTTLE: ThrottleConfig = {
  limit: throttleLimit(process.env['NAVIGATION_GEOCODE_THROTTLE_LIMIT'], 30),
  ttl: throttleLimit(process.env['NAVIGATION_GEOCODE_THROTTLE_TTL_MS'], 60_000),
};

@ApiTags('navigation')
@ApiBearerAuth()
@Controller('navigation')
export class NavigationController {
  constructor(private readonly navigation: NavigationService) {}

  @Post('route')
  @Throttle({ navigation: ROUTE_THROTTLE })
  @ApiOperation({
    summary: 'Calculate a driving route between two coordinates (OSRM)',
  })
  calculateRoute(@Body() dto: CalculateRouteDto) {
    return this.navigation.calculateRoute(dto);
  }

  @Get('geocode')
  @Throttle({ navigation: GEOCODE_THROTTLE })
  @ApiOperation({ summary: 'Search for a place by name (OSM Nominatim)' })
  searchPlaces(@Query() query: GeocodeQuery) {
    return this.navigation.searchPlaces(query);
  }
}
