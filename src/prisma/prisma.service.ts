import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly maxConnectRetries = 3;
  private readonly retryDelayMs = 2_000;

  constructor() {
    const normalizedDatabaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);

    super(
      normalizedDatabaseUrl
        ? {
            datasources: {
              db: {
                url: normalizedDatabaseUrl,
              },
            },
          }
        : undefined,
    );

    if (normalizedDatabaseUrl !== process.env.DATABASE_URL) {
      this.logger.warn(
        'Removed `channel_binding` from DATABASE_URL for Prisma compatibility and set a safe connect timeout.',
      );
    }
  }

  async onModuleInit() {
    for (let attempt = 1; attempt <= this.maxConnectRetries; attempt += 1) {
      try {
        await this.$connect();
        return;
      } catch (error) {
        const isRetriable =
          error instanceof Prisma.PrismaClientInitializationError && error.errorCode === 'P1001';

        if (!isRetriable || attempt === this.maxConnectRetries) {
          throw error;
        }

        this.logger.warn(
          `Prisma connection failed with P1001 (attempt ${attempt}/${this.maxConnectRetries}). Retrying in ${this.retryDelayMs}ms...`,
        );

        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

function normalizeDatabaseUrl(databaseUrl?: string): string | undefined {
  if (!databaseUrl) {
    return databaseUrl;
  }

  let parsed: URL;

  try {
    parsed = new URL(databaseUrl);
  } catch {
    return databaseUrl;
  }

  if (!parsed.searchParams.has('channel_binding')) {
    return databaseUrl;
  }

  parsed.searchParams.delete('channel_binding');

  if (!parsed.searchParams.has('connect_timeout')) {
    parsed.searchParams.set('connect_timeout', '15');
  }

  return parsed.toString();
}
