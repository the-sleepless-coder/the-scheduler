import {
  BadRequestException,
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
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { PeriodItem } from './period-item.entity';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

class CreatePeriodItemDto {
  @Matches(DATE_PATTERN)
  startDate: string;

  @Matches(DATE_PATTERN)
  endDate: string;

  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;
}

type AuthedRequest = { user: JwtPayload };

@Controller('period-items')
@UseGuards(JwtAuthGuard)
export class PeriodItemsController {
  constructor(
    @InjectRepository(PeriodItem)
    private readonly periodItems: Repository<PeriodItem>,
  ) {}

  // [from, to] 구간과 겹치는 기간 할일 목록
  @Get()
  list(
    @Req() req: AuthedRequest,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.periodItems.find({
      where: {
        userId: req.user.sub,
        startDate: LessThanOrEqual(to),
        endDate: MoreThanOrEqual(from),
      },
      order: { startDate: 'ASC', createdAt: 'ASC' },
    });
  }

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreatePeriodItemDto) {
    if (dto.endDate < dto.startDate) {
      throw new BadRequestException('끝 날짜가 시작 날짜보다 빠를 수 없습니다.');
    }
    return this.periodItems.save(
      this.periodItems.create({ ...dto, userId: req.user.sub }),
    );
  }

  @Delete(':id')
  async remove(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const item = await this.periodItems.findOne({
      where: { id, userId: req.user.sub },
    });
    if (item) await this.periodItems.softRemove(item);
    return { ok: true };
  }
}
