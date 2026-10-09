import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { In, IsNull, Like, Repository } from 'typeorm';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { HiddenFolder } from './hidden-folder.entity';
import { MemoItem } from './memo-item.entity';
import { MindTopic } from './mind-topic.entity';
import { Task } from './task.entity';

class CreateMemoItemDto {
  @Matches(/^\d{4}-\d{2}$/)
  month: string;

  @IsString()
  @MaxLength(50)
  category: string;

  @IsString()
  @MaxLength(200)
  text: string;

  @IsOptional()
  @IsInt()
  parentId?: number;
}

class UpdateMemoItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  content?: string | null;

  @IsOptional()
  @IsBoolean()
  assigned?: boolean;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

class RenameFolderDto {
  @Matches(/^\d{4}-\d{2}$/)
  month: string;

  @IsString()
  @MaxLength(50)
  from: string;

  @IsString()
  @MaxLength(50)
  to: string;
}

class DeleteFolderDto {
  @Matches(/^\d{4}-\d{2}$/)
  month: string;

  @IsString()
  @MaxLength(50)
  category: string;
}

class CopyToNextMonthDto {
  @Matches(/^\d{4}-\d{2}$/)
  month: string;

  // 없으면 그 달 전체 폴더를 복사
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsBoolean()
  excludeCompleted?: boolean;

  // 모달에서 사용자가 직접 고른 항목 id들. 있으면 완료 여부와 상관없이 이것만 복사.
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  itemIds?: number[];
}

type AuthedRequest = { user: JwtPayload };

@Controller('memo-items')
@UseGuards(JwtAuthGuard)
export class MemoItemsController {
  constructor(
    @InjectRepository(MemoItem)
    private readonly items: Repository<MemoItem>,
    @InjectRepository(Task)
    private readonly tasks: Repository<Task>,
    @InjectRepository(MindTopic)
    private readonly topics: Repository<MindTopic>,
    @InjectRepository(HiddenFolder)
    private readonly hidden: Repository<HiddenFolder>,
  ) {}

  @Get('hidden-folders')
  async hiddenFolders(
    @Req() req: AuthedRequest,
    @Query('month') month: string,
  ) {
    const rows = await this.hidden.find({
      where: { userId: req.user.sub, month },
    });
    return rows.map((r) => r.category);
  }

  /** 폴더 이름 변경 — 그 달의 메모 항목 + 할일 분류 + 주제 이름까지 일괄 변경 */
  @Post('rename-folder')
  async renameFolder(@Req() req: AuthedRequest, @Body() dto: RenameFolderDto) {
    const userId = req.user.sub;
    await this.items.update(
      { userId, month: dto.month, category: dto.from },
      { category: dto.to },
    );
    await this.tasks.update(
      { userId, category: dto.from, date: Like(`${dto.month}%`) },
      { category: dto.to },
    );
    await this.topics.update(
      { userId, month: dto.month, name: dto.from },
      { name: dto.to },
    );
    return { ok: true };
  }

  /**
   * 폴더 삭제 = soft delete(숨김).
   * 할일/메모 데이터는 전혀 건드리지 않고 폴더 목록에서만 감춘다.
   */
  @Post('delete-folder')
  async deleteFolder(@Req() req: AuthedRequest, @Body() dto: DeleteFolderDto) {
    const userId = req.user.sub;
    const exists = await this.hidden.findOne({
      where: { userId, month: dto.month, category: dto.category },
    });
    if (!exists) {
      await this.hidden.save(
        this.hidden.create({ userId, month: dto.month, category: dto.category }),
      );
    }
    await this.topics.update(
      { userId, month: dto.month, name: dto.category },
      { isFolder: false },
    );
    return { ok: true };
  }

  /**
   * 이달 메모 항목을 다음달로 순수 복사(원본은 그대로 유지, 서로 연결되지 않음).
   * itemIds가 있으면 그 항목들만(완료 여부와 무관하게 모달에서 고른 것) 복사.
   * 없으면 category 기준(없으면 전체 폴더) + excludeCompleted로 이미 완료된 항목은 대상에서 제외.
   * 완료 여부는 원본 그대로 복사되고(완료된 채 넘어감), 이미 다음달 같은 자리에
   * 같은 텍스트가 있으면 중복 생성하지 않는다.
   */
  @Post('copy-to-next-month')
  async copyToNextMonth(
    @Req() req: AuthedRequest,
    @Body() dto: CopyToNextMonthDto,
  ) {
    const userId = req.user.sub;
    const [y, m] = dto.month.split('-').map(Number);
    const next = new Date(y, m, 1); // m은 1-based라 그대로 넣으면 다음달 1일이 됨
    const nextMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;

    const explicitIds = dto.itemIds && dto.itemIds.length > 0;
    const where: Record<string, unknown> = { userId, month: dto.month };
    if (explicitIds) {
      where.id = In(dto.itemIds!);
    } else if (dto.category) {
      where.category = dto.category;
    }
    const source = await this.items.find({
      where,
      order: { parentId: 'ASC', position: 'ASC' },
    });

    // 모달에서 직접 고른 경우엔 완료 여부와 무관하게 선택한 그대로 복사
    const keep = (it: MemoItem) =>
      explicitIds || !(dto.excludeCompleted && it.completed);
    const idMap = new Map<number, number>();
    let copied = 0;

    // 상위 먼저 복사해 새 id를 확보한 뒤, 하위를 그 새 상위에 매단다
    for (const it of source.filter((x) => !x.parentId && keep(x))) {
      const exists = await this.items.findOne({
        where: {
          userId,
          month: nextMonth,
          category: it.category,
          text: it.text,
          parentId: IsNull(),
        },
      });
      if (exists) {
        idMap.set(it.id, exists.id);
        continue;
      }
      const created = await this.items.save(
        this.items.create({
          userId,
          month: nextMonth,
          category: it.category,
          text: it.text,
          content: it.content,
          completed: it.completed,
          position: it.position,
        }),
      );
      idMap.set(it.id, created.id);
      copied++;
    }

    for (const it of source.filter((x) => x.parentId && keep(x))) {
      const newParentId = idMap.get(it.parentId!);
      if (newParentId === undefined) continue; // 상위가 완료라 스킵된 경우
      const exists = await this.items.findOne({
        where: {
          userId,
          month: nextMonth,
          category: it.category,
          text: it.text,
          parentId: newParentId,
        },
      });
      if (exists) continue;
      await this.items.save(
        this.items.create({
          userId,
          month: nextMonth,
          category: it.category,
          text: it.text,
          content: it.content,
          completed: it.completed,
          parentId: newParentId,
          position: it.position,
        }),
      );
      copied++;
    }

    return { ok: true, copied, nextMonth };
  }

  @Get()
  list(@Req() req: AuthedRequest, @Query('month') month: string) {
    return this.items.find({
      where: { userId: req.user.sub, month },
      order: { category: 'ASC', position: 'ASC', createdAt: 'ASC' },
    });
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateMemoItemDto) {
    const count = await this.items.count({
      where: { userId: req.user.sub, month: dto.month, category: dto.category },
    });
    return this.items.save(
      this.items.create({ ...dto, userId: req.user.sub, position: count }),
    );
  }

  @Patch(':id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMemoItemDto,
  ) {
    const item = await this.items.findOne({
      where: { id, userId: req.user.sub },
    });
    if (!item) throw new NotFoundException('항목을 찾을 수 없습니다.');
    Object.assign(item, dto);
    const saved = await this.items.save(item);
    // 하위 항목의 완료 상태가 바뀌면 → 상위 분류 완료 여부 재계산
    // (하위가 전부 완료 → 상위 완료, 하나라도 미완료 → 상위 미완료)
    if (dto.completed !== undefined && saved.parentId) {
      await this.recomputeParentCompleted(req.user.sub, saved.parentId);
    }
    return saved;
  }

  /** 상위 분류의 완료 여부를 하위 항목들 기준으로 다시 계산 */
  private async recomputeParentCompleted(userId: number, parentId: number) {
    const parent = await this.items.findOne({
      where: { id: parentId, userId },
    });
    if (!parent) return;
    const subs = await this.items.find({ where: { userId, parentId } });
    const allDone = subs.length > 0 && subs.every((s) => s.completed);
    if (parent.completed !== allDone) {
      parent.completed = allDone;
      await this.items.save(parent);
    }
  }

  @Delete(':id')
  async remove(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const item = await this.items.findOne({
      where: { id, userId: req.user.sub },
    });
    if (item) await this.items.softRemove(item);
    return { ok: true };
  }
}
