import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { JsonLoggerService } from './common/logger/json-logger.service';

async function bootstrap() {
  const logger = new JsonLoggerService();
  const app = await NestFactory.create(AppModule, { logger });

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.WEB_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  logger.log(`VanTrade API running on http://localhost:${port}/api`, 'Bootstrap');
}

bootstrap();
