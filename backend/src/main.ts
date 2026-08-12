import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/app.config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const config = app.get(AppConfig);

  // Graceful shutdown (closes DB pools, etc. on SIGTERM/SIGINT).
  app.enableShutdownHooks();

  app.setGlobalPrefix('api');

  // Security headers.
  app.use(helmet());

  // The exact frontend origin (never "*").
  app.enableCors({
    origin: config.frontendUrl,
    credentials: true,
  });

  // Global validation: strip unknown fields, transform + validate payloads.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('RideTogether API')
    .setDescription('Trip rooms, riders, and live rides for RideTogether.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(config.port);
  logger.log(`API running at http://localhost:${config.port}/api`);
}
void bootstrap();
