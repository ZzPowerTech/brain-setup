import { Module } from '@nestjs/common';
import { BrainController } from './brain.controller';
import { BrainService } from './brain.service';

@Module({
  controllers: [BrainController],
  providers: [BrainService],
})
export class BrainModule {}
