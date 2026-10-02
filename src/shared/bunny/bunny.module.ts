import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BunnyService } from './bunny.service';

@Module({
  imports: [ConfigModule],
  providers: [BunnyService],
  exports: [BunnyService],
})
export class BunnyModule {}
