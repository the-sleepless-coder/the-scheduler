import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Repository } from 'typeorm';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { MonthMemo } from './month-memo.entity';

class SaveMonthMemoDto {
  // 있으면 그 메모를 수정, 없으면 새 메모 생성 (같은 날짜+폴더라도 덮어쓰지 않음)
  @IsOptional()
  @IsInt()
  id?: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  @IsString()
  @MaxLength(50)
  category: string;

  @IsString()
  @MaxLength(20000)
  content: string;
}

type AuthedRequest = { user: JwtPayload };

@Controller('month-memos')
@UseGuards(JwtAuthGuard)
export class MonthMemosController {
  constructor(
    @InjectRepository(MonthMemo)
    private readonly memos: Repository<MonthMemo>,
  ) {}

  @Get()
  list(@Req() req: AuthedRequest, @Query('month') month: string) {
    return this.memos.find({
      where: { userId: req.user.sub, month },
      // date만으로는 같은 날 쓴 여러 메모끼리 순서가 뒤섞여서 createdAt까지 같이 정렬
      order: { category: 'ASC', date: 'DESC', createdAt: 'DESC' },
    });
  }

  /** id가 있으면 그 메모를 수정(내용 비면 삭제), 없으면 항상 새 메모 생성.
   *  같은 날짜+폴더라도 id 없이 저장하면 기존 것을 덮어쓰지 않고 별개의 메모로 남는다. */
  @Put()
  async save(@Req() req: AuthedRequest, @Body() dto: SaveMonthMemoDto) {
    if (dto.id) {
      const existing = await this.memos.findOne({
        where: { id: dto.id, userId: req.user.sub },
      });
      if (!existing) return { ok: false };
      if (!dto.content.trim()) {
        await this.memos.softRemove(existing);
        return { ok: true, deleted: true };
      }
      existing.content = dto.content;
      existing.date = dto.date;
      existing.category = dto.category;
      return this.memos.save(existing);
    }
    if (!dto.content.trim()) {
      return { ok: true, deleted: false };
    }
    return this.memos.save(
      this.memos.create({
        date: dto.date,
        month: dto.date.slice(0, 7),
        category: dto.category,
        content: dto.content,
        userId: req.user.sub,
      }),
    );
  }

  /** soft delete — 지금은 휴지통 UI 없이 그냥 사라짐 (나중에 휴지통 도입 시 이 데이터 재사용) */
  @Delete(':id')
  async remove(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const existing = await this.memos.findOne({
      where: { id, userId: req.user.sub },
    });
    if (!existing) return { ok: false };
    await this.memos.softRemove(existing);
    return { ok: true };
  }
}
