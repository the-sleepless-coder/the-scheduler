import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Repository } from 'typeorm';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { RecurringItem } from './recurring.entity';

class CreateRecurringDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;
}

type AuthedRequest = { user: JwtPayload };

@Controller('recurring')
@UseGuards(JwtAuthGuard)
export class RecurringController {
  constructor(
    @InjectRepository(RecurringItem)
    private readonly recurring: Repository<RecurringItem>,
  ) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.recurring.find({
      where: { userId: req.user.sub },
      order: { createdAt: 'ASC' },
    });
  }

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateRecurringDto) {
    return this.recurring.save(
      this.recurring.create({ ...dto, userId: req.user.sub }),
    );
  }

  @Delete(':id')
  async remove(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const item = await this.recurring.findOne({
      where: { id, userId: req.user.sub },
    });
    if (item) await this.recurring.softRemove(item);
    return { ok: true };
  }
}
