import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptor/transform.interceptor';
import { ClassSerializerInterceptor, VersioningType } from '@nestjs/common';
import cookieParser from 'cookie-parser';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new TransformInterceptor(reflector));
  app.useGlobalInterceptors(new ClassSerializerInterceptor(reflector));
  app.use(cookieParser());

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI, //v
    defaultVersion: ['1'], //v1
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
