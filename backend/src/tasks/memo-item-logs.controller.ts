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
import { IsInt, IsString, Matches, MaxLength, Min } from 'class-validator';
import { Between, Repository } from 'typeorm';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { MemoItemLog } from './memo-item-log.entity';

class CreateLogDto {
  @IsInt()
  memoItemId: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  @IsString()
  @MaxLength(100)
  label: string;

  @IsInt()
  @Min(1)
  count: number;

  @IsString()
  @MaxLength(20)
  unit: string;
}

type AuthedRequest = { user: JwtPayload };

@Controller('memo-item-logs')
@UseGuards(JwtAuthGuard)
export class MemoItemLogsController {
  constructor(
    @InjectRepository(MemoItemLog)
    private readonly logs: Repository<MemoItemLog>,
  ) {}

  // Daily는 from=to=오늘로, Memo 탭은 그 달 1일~말일로 호출
  @Get()
  list(
    @Req() req: AuthedRequest,
    @Query('memoItemId', ParseIntPipe) memoItemId: number,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.logs.find({
      where: { userId: req.user.sub, memoItemId, date: Between(from, to) },
      order: { date: 'DESC', createdAt: 'DESC' },
    });
  }

  // 같은 항목에서 예전에 썼던 라벨들 — Daily/Memo 탭 입력창 드롭다운용
  @Get('labels')
  async labels(
    @Req() req: AuthedRequest,
    @Query('memoItemId', ParseIntPipe) memoItemId: number,
  ) {
    const rows = await this.logs
      .createQueryBuilder('l')
      .select('DISTINCT l.label', 'label')
      .where('l.userId = :userId', { userId: req.user.sub })
      .andWhere('l.memoItemId = :memoItemId', { memoItemId })
      .orderBy('l.label', 'ASC')
      .getRawMany<{ label: string }>();
    return rows.map((r) => r.label);
  }

  // 같은 항목에서 예전에 썼던 단위들 — 최근에 쓴 순서로 (운동=분, 코딩=문제 처럼 항목마다 다름)
  @Get('units')
  async units(
    @Req() req: AuthedRequest,
    @Query('memoItemId', ParseIntPipe) memoItemId: number,
  ) {
    const rows = await this.logs
      .createQueryBuilder('l')
      .select('l.unit', 'unit')
      .addSelect('MAX(l.createdAt)', 'latest')
      .where('l.userId = :userId', { userId: req.user.sub })
      .andWhere('l.memoItemId = :memoItemId', { memoItemId })
      .groupBy('l.unit')
      .orderBy('latest', 'DESC')
      .getRawMany<{ unit: string }>();
    return rows.map((r) => r.unit);
  }

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateLogDto) {
    return this.logs.save(this.logs.create({ ...dto, userId: req.user.sub }));
  }

  @Delete(':id')
  async remove(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const log = await this.logs.findOne({
      where: { id, userId: req.user.sub },
    });
    if (log) await this.logs.softRemove(log);
    return { ok: true };
  }
}
