import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureHttp } from './http.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureHttp(app);
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}
bootstrap();
