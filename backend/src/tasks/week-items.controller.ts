import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Between, Repository } from 'typeorm';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { WeekItem } from './week-item.entity';

class CreateWeekItemDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  weekStart: string;

  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  // "0,2,4" 형태 (0=월 ~ 6=일)
  @IsOptional()
  @Matches(/^[0-6](,[0-6]){0,6}$/)
  days?: string;
}

type AuthedRequest = { user: JwtPayload };

@Controller('week-items')
@UseGuards(JwtAuthGuard)
export class WeekItemsController {
  constructor(
    @InjectRepository(WeekItem)
    private readonly weekItems: Repository<WeekItem>,
  ) {}

  @Get()
  list(
    @Req() req: AuthedRequest,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.weekItems.find({
      where: { userId: req.user.sub, weekStart: Between(from, to) },
      order: { weekStart: 'ASC', createdAt: 'ASC' },
    });
  }

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateWeekItemDto) {
    return this.weekItems.save(
      this.weekItems.create({ ...dto, userId: req.user.sub }),
    );
  }

  @Delete(':id')
  async remove(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const item = await this.weekItems.findOne({
      where: { id, userId: req.user.sub },
    });
    if (item) await this.weekItems.softRemove(item);
    return { ok: true };
  }
}
