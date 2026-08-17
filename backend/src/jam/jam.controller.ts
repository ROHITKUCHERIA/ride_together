import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JamService } from './jam.service';
import { JamControlDto } from './dto/jam-control.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';

@ApiTags('jam')
@ApiBearerAuth()
@Controller('jam')
export class JamController {
  constructor(private readonly jam: JamService) {}

  @Get(':jamId/state')
  @ApiOperation({ summary: 'Get the authoritative current Jam state' })
  getState(
    @Param('jamId', new ParseUUIDPipe()) jamId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jam.getState(jamId, user.id);
  }

  @Post(':jamId/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join a Jam as a participant (members only)' })
  join(
    @Param('jamId', new ParseUUIDPipe()) jamId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jam.join(jamId, user.id);
  }

  @Post(':jamId/leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave a Jam (hosts end the Jam instead)' })
  leave(
    @Param('jamId', new ParseUUIDPipe()) jamId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jam.leave(jamId, user.id);
  }

  @Delete(':jamId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End/delete a Jam (Host only)' })
  async remove(
    @Param('jamId', new ParseUUIDPipe()) jamId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.jam.deleteJam(jamId, user.id);
    return { message: 'The Jam has ended.' };
  }

  @Post(':jamId/control')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Host-only playback control (play/pause/seek/song)' })
  control(
    @Param('jamId', new ParseUUIDPipe()) jamId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: JamControlDto,
  ) {
    return this.jam.control(jamId, user.id, dto);
  }
}