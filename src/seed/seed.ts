import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { SeedService } from './seed.service';

/**
 * Standalone seed runner (`npm run seed`). The app also auto-seeds on bootstrap
 * via SeedService.onApplicationBootstrap, so this is mostly for explicit/CI use.
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  await app.get(SeedService).run();
  await app.close();
  Logger.log('Seed complete', 'seed');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
