import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppConfigModule } from './config/app-config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TripsModule } from './trips/trips.module';
import { TripMembersModule } from './trip-members/trip-members.module';
import { TripLocationsModule } from './locations/locations.module';
import { RealtimeModule } from './realtime/realtime.module';
import { MusicModule } from './music/music.module';
import { PlaylistsModule } from './playlists/playlists.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    AppConfigModule,
    PrismaModule,
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 120 },
      { name: 'auth', ttl: 60_000, limit: 10 },
      { name: 'music', ttl: 60_000, limit: 30 },
    ]),
    AuthModule,
    UsersModule,
    TripsModule,
    TripMembersModule,
    TripLocationsModule,
    RealtimeModule,
    MusicModule,
    PlaylistsModule,
  ],
  controllers: [AppController],
  providers: [
    // JWT guard applies to every route unless marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Rate limiting is enforced on every route (auth endpoints have tighter
    // limits via @Throttle — see AuthController).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Every response/error flows through the unified error shape.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Successful responses are wrapped as { success: true, data, meta? }.
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
