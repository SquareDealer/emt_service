import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // Fail fast with a clear message instead of an opaque TypeORM init error.
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required (set it in the environment)');
  }

  const app = await NestFactory.create(AppModule);

  // All API routes live under /api so they don't collide with the SPA's own
  // client-side routes (/clients, /settings, /work-orders/:id …) when both are
  // served from the same origin behind the reverse proxy.
  app.setGlobalPrefix('api');

  // Same-origin in production (SPA + API on one domain) needs no CORS; set
  // CORS_ORIGIN (comma-separated) for cross-origin setups. Empty → reflect any
  // origin, a convenience for local dev (Vite :5173 → API :3000).
  const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : true;
  app.enableCors({ origin: corsOrigin, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`tatarin-crm API listening on :${port} (prefix /api)`);
}
bootstrap();
