import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TripNavigationService } from './trip-navigation.service';
import { StartNavigationSessionDto } from './dto/start-navigation-session.dto';
import { UpdateNavigationStatusDto } from './dto/update-navigation-status.dto';
import { RequestRerouteDto } from './dto/request-reroute.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';

interface ThrottleConfig {
  limit: number;
  ttl: number;
}

function throttleLimit(env: string | undefined, fallback: number): number {
  const n = Number(env);
  return env && Number.isFinite(n) ? n : fallback;
}

const STATUS_THROTTLE: ThrottleConfig = {
  limit: throttleLimit(process.env['NAVIGATION_STATUS_THROTTLE_LIMIT'], 60),
  ttl: throttleLimit(process.env['NAVIGATION_STATUS_THROTTLE_TTL_MS'], 60_000),
};

const REROUTE_THROTTLE: ThrottleConfig = {
  limit: throttleLimit(process.env['NAVIGATION_ROUTE_THROTTLE_LIMIT'], 20),
  ttl: throttleLimit(process.env['NAVIGATION_ROUTE_THROTTLE_TTL_MS'], 60_000),
};

/**
 * Group navigation endpoints (members only). A group session always targets the
 * trip's shared destination; personal sessions are stored for reconnect only.
 */
@ApiTags('navigation')
@ApiBearerAuth()
@Controller('trips/:tripId/navigation')
export class TripNavigationController {
  constructor(private readonly navigation: TripNavigationService) {}

  @Get()
  @ApiOperation({
    summary:
      'Group navigation snapshot (destination + rider states + group ETA)',
  })
  getGroupSnapshot(
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.navigation.getGroupSnapshot(tripId, user.id);
  }

  @Post('session')
  @Throttle({ navigation: STATUS_THROTTLE })
  @ApiOperation({
    summary:
      'Start (or restart) my navigation session to the shared destination',
  })
  startSession(
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StartNavigationSessionDto,
  ) {
    return this.navigation.startSession(tripId, user.id, dto);
  }

  @Patch('session')
  @Throttle({ navigation: STATUS_THROTTLE })
  @ApiOperation({
    summary: 'Update my navigation status / ETA (group visible)',
  })
  updateSession(
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNavigationStatusDto,
  ) {
    return this.navigation.updateSession(tripId, user.id, dto);
  }

  @Delete('session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop my navigation session' })
  async stopSession(
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.navigation.stopSession(tripId, user.id);
    return { message: 'Navigation stopped.' };
  }

  @Post('reroute')
  @Throttle({ navigation: REROUTE_THROTTLE })
  @ApiOperation({
    summary:
      'Group reroute with a distributed cooldown (IDEMPOTENT via requestId)',
  })
  reroute(
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestRerouteDto,
  ) {
    return this.navigation.tryReroute(tripId, user.id, dto);
  }
}
