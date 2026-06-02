import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));

  const configService = app.get(ConfigService);
  const isDev = process.env.NODE_ENV !== 'production';
  const configuredOrigins = configService.get<string[]>('corsOrigins') ?? [];
  app.enableCors({
    origin: [
      'https://smartcupleague.com',
      'https://app.smartcupleague.com',
      ...configuredOrigins,
      ...(isDev
        ? [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:3001',
            'http://127.0.0.1:3001',
            'http://localhost:5173',
            'http://127.0.0.1:5173',
          ]
        : []),
    ],
  });

  const port = configService.getOrThrow<number>('port');
  await app.listen(port, () => {
    console.log(`Rewards backend running on port ${port}`);
  });
}

bootstrap();
