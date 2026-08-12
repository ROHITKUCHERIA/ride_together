import { Global, Module } from '@nestjs/common';
import { AppConfig } from './app.config';

/**
 * Global configuration provider. Exported app-wide so services outside
 * AuthModule (e.g. PrismaService, guards) can inject AppConfig directly.
 */
@Global()
@Module({
  providers: [AppConfig],
  exports: [AppConfig],
})
export class AppConfigModule {}
