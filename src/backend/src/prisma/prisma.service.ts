import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppConfig } from '../config/config.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfig) {
    super({ datasources: { db: { url: config.env.DATABASE_URL } } });
  }

  async onModuleInit(): Promise<void> {
    // Si la base no está disponible el servidor arranca igual y /health lo reporta como degradado.
    try {
      await this.$connect();
    } catch (error) {
      this.logger.warn(`No se pudo conectar a la base de datos: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
