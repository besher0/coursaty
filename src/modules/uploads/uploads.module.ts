import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { BunnyModule } from '../../shared/bunny/bunny.module';

@Module({
  imports: [BunnyModule],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
