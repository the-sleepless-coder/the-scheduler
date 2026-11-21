import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import { MemoItem } from './memo-item.entity';
import { PeriodItem } from './period-item.entity';
import { RecurringItem } from './recurring.entity';
import { Task } from './task.entity';
import { CreateTaskDto, UpdateTaskDto } from './tasks.dto';
import { WeekItem } from './week-item.entity';

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const addDaysStr = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00`);
  d.setDate(d.getDate() + n);
  return fmt(d);
};

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectRepository(RecurringItem)
    private readonly recurring: Repository<RecurringItem>,
    @InjectRepository(WeekItem)
    private readonly weekItems: Repository<WeekItem>,
    @InjectRepository(PeriodItem)
    private readonly periodItems: Repository<PeriodItem>,
    @InjectRepository(MemoItem)
    private readonly memoItems: Repository<MemoItem>,
  ) {}

  /**
   * 유저가 쓴 분류 목록. MySQL ci collation이 js/JS를 하나로 합쳐버리므로
   * JS단에서 대소문자 무시 중복 제거하되, 가장 최근에 수정한 표기를 우선한다.
   */
  async categories(userId: number, month?: string): Promise<string[]> {
    const rows = await this.tasks.find({
      where: {
        userId,
        category: Not(IsNull()),
        ...(month ? { date: Between(`${month}-01`, `${month}-31`) } : {}),
      },
      select: { category: true, updatedAt: true },
      order: { updatedAt: 'DESC' },
    });
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of rows) {
      const key = row.category!.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(row.category!);
      }
    }
    return out.sort((a, b) => a.localeCompare(b));
  }

  async findByDate(userId: number, date: string) {
    await this.materializeRecurring(userId, date, date);
    await this.materializeWeekItems(userId, date, date);
    await this.materializePeriodItems(userId, date, date);
    return this.tasks.find({
      where: { userId, date },
      order: { position: 'ASC', createdAt: 'ASC' },
    });
  }

  async findByRange(userId: number, from: string, to: string) {
    await this.materializeRecurring(userId, from, to);
    await this.materializeWeekItems(userId, from, to);
    await this.materializePeriodItems(userId, from, to);
    return this.tasks.find({
      where: { userId, date: Between(from, to) },
      order: { date: 'ASC', createdAt: 'ASC' },
    });
  }

  /**
   * 활성 recurring 아이템을 [from, to] 구간의 할일로 자동 생성.
   * - 아이템 등록일 이전 날짜는 건드리지 않음 (과거 backfill 방지)
   * - 이미 있거나 사용자가 soft delete한 날짜는 다시 만들지 않음
   */
  private async materializeRecurring(userId: number, from: string, to: string) {
    const items = await this.recurring.find({ where: { userId } });
    if (items.length === 0) return;

    const existing = await this.tasks.find({
      where: { userId, date: Between(from, to) },
      withDeleted: true,
    });
    const have = new Set(
      existing
        .filter((t) => t.recurringId !== null)
        .map((t) => `${t.recurringId}|${t.date}`),
    );

    const toCreate: Partial<Task>[] = [];
    for (const item of items) {
      const startDate = fmt(item.createdAt);
      for (
        let d = new Date(`${from}T00:00:00`);
        fmt(d) <= to;
        d.setDate(d.getDate() + 1)
      ) {
        const date = fmt(d);
        if (date < startDate) continue;
        if (have.has(`${item.id}|${date}`)) continue;
        toCreate.push({
          userId,
          title: item.title,
          category: item.category,
          date,
          recurringId: item.id,
        });
      }
    }
    if (toCreate.length > 0) {
      await this.tasks.save(this.tasks.create(toCreate));
    }
  }

  async create(userId: number, dto: CreateTaskDto) {
    const count = await this.tasks.count({ where: { userId, date: dto.date } });
    // 분류가 Schedule이면 자동으로 Schedule 체크리스트로
    const isChore = (dto.category?.toLowerCase() ?? '') === 'schedule';
    const task = await this.tasks.save(
      this.tasks.create({ ...dto, userId, position: count, isChore }),
    );
    // 분류가 있으면 Memo 탭의 해당 분류 파일에도 항목으로 동기화
    // (타임박스 복사본은 원본이 이미 동기화했으니 건너뜀)
    if (dto.category && !dto.parentTaskId) {
      await this.syncMemoItem(userId, dto.date, dto.category, dto.title);
    }
    return task;
  }

  /** Daily 완료 체크를 연결된 메모 항목에 반영. 하위가 다 끝나면 상위도 자동 완료 */
  private async syncMemoCompleted(
    userId: number,
    task: Task,
    completed: boolean,
  ) {
    const month = task.date.slice(0, 7);
    const target = task.subItemId
      ? await this.memoItems.findOne({
          where: { id: task.subItemId, userId },
        })
      : await this.memoItems.findOne({
          where: {
            userId,
            month,
            category: task.category ?? '미분류',
            text: task.title,
          },
        });
    if (!target || target.completed === completed) return;
    target.completed = completed;
    await this.memoItems.save(target);

    if (target.parentId) {
      const parent = await this.memoItems.findOne({
        where: { id: target.parentId, userId },
      });
      if (parent) {
        const subs = await this.memoItems.find({
          where: { userId, parentId: parent.id },
        });
        const allDone = subs.length > 0 && subs.every((s) => s.completed);
        if (parent.completed !== allDone) {
          parent.completed = allDone;
          await this.memoItems.save(parent);
        }
      }
    }
  }

  /** Daily에서 추가한 할일을 Memo 탭 항목으로 반영 (같은 항목 있으면 생략) */
  private async syncMemoItem(
    userId: number,
    date: string,
    category: string,
    title: string,
    memo?: string | null,
  ) {
    const month = date.slice(0, 7);
    const existing = await this.memoItems.findOne({
      where: { userId, month, category, text: title },
    });
    if (existing) {
      // 새로 옮겨온 항목에 내용이 없고 할일에 메모가 있으면 물려줌
      if (!existing.content && memo) {
        existing.content = memo;
        await this.memoItems.save(existing);
      }
      return;
    }
    const count = await this.memoItems.count({
      where: { userId, month, category },
    });
    await this.memoItems.save(
      this.memoItems.create({
        userId,
        month,
        category,
        text: title,
        position: count,
        content: memo ?? null,
      }),
    );
  }

  async update(userId: number, id: number, dto: UpdateTaskDto) {
    const task = await this.findOwn(userId, id);
    Object.assign(task, dto);
    // 분류를 Schedule로 바꾸면 자동으로 Schedule 체크리스트로
    if (
      dto.category &&
      dto.isChore === undefined &&
      dto.category.toLowerCase() === 'schedule'
    ) {
      task.isChore = true;
    }
    const saved = await this.tasks.save(task);
    // 완료 체크가 바뀌면 연결된 메모 항목(하위 선택 시 그 하위)에도 반영
    if (dto.completed !== undefined) {
      await this.syncMemoCompleted(userId, saved, dto.completed);
    }
    // 분류가 바뀌면 Memo 탭의 새 분류 파일에도 항목 동기화 (메모 내용 포함)
    if (dto.category) {
      await this.syncMemoItem(
        userId,
        saved.date,
        dto.category,
        saved.title,
        saved.memo,
      );
    }
    return saved;
  }

  async remove(userId: number, id: number) {
    const task = await this.findOwn(userId, id);
    await this.tasks.softRemove(task);
    return { ok: true };
  }

  /**
   * 주간 할일을 그 주(월~일) 날짜들의 할일로 자동 생성.
   * 등록일 이전 날짜는 건드리지 않고, 사용자가 지운 날짜는 다시 만들지 않음.
   */
  private async materializeWeekItems(userId: number, from: string, to: string) {
    const items = await this.weekItems.find({
      where: { userId, weekStart: Between(addDaysStr(from, -6), to) },
    });
    if (items.length === 0) return;

    const existing = await this.tasks.find({
      where: { userId, date: Between(from, to) },
      withDeleted: true,
    });
    const have = new Set(
      existing
        .filter((t) => t.weekItemId !== null)
        .map((t) => `${t.weekItemId}|${t.date}`),
    );

    const toCreate: Partial<Task>[] = [];
    for (const item of items) {
      const created = fmt(item.createdAt);
      const start = [item.weekStart, created, from].sort().pop()!;
      const end = [addDaysStr(item.weekStart, 6), to].sort().shift()!;
      const allowedDays = item.days
        ? new Set(item.days.split(',').map(Number))
        : null;
      const weekStartMs = new Date(`${item.weekStart}T00:00:00`).getTime();
      for (
        let d = new Date(`${start}T00:00:00`);
        fmt(d) <= end;
        d.setDate(d.getDate() + 1)
      ) {
        const date = fmt(d);
        if (allowedDays) {
          const offset = Math.round((d.getTime() - weekStartMs) / 86400000);
          if (!allowedDays.has(offset)) continue;
        }
        if (have.has(`${item.id}|${date}`)) continue;
        toCreate.push({
          userId,
          title: item.title,
          category: item.category,
          date,
          weekItemId: item.id,
        });
      }
    }
    if (toCreate.length > 0) {
      await this.tasks.save(this.tasks.create(toCreate));
    }
  }

  /** 기간 할일을 [startDate, endDate] 구간의 매일 할일로 자동 생성 */
  private async materializePeriodItems(
    userId: number,
    from: string,
    to: string,
  ) {
    const items = await this.periodItems.find({
      where: {
        userId,
        startDate: LessThanOrEqual(to),
        endDate: MoreThanOrEqual(from),
      },
    });
    if (items.length === 0) return;

    const existing = await this.tasks.find({
      where: { userId, date: Between(from, to) },
      withDeleted: true,
    });
    const have = new Set(
      existing
        .filter((t) => t.periodItemId !== null)
        .map((t) => `${t.periodItemId}|${t.date}`),
    );

    const toCreate: Partial<Task>[] = [];
    for (const item of items) {
      const created = fmt(item.createdAt);
      const start = [item.startDate, created, from].sort().pop()!;
      const end = [item.endDate, to].sort().shift()!;
      for (
        let d = new Date(`${start}T00:00:00`);
        fmt(d) <= end;
        d.setDate(d.getDate() + 1)
      ) {
        const date = fmt(d);
        if (have.has(`${item.id}|${date}`)) continue;
        toCreate.push({
          userId,
          title: item.title,
          category: item.category,
          date,
          periodItemId: item.id,
        });
      }
    }
    if (toCreate.length > 0) {
      await this.tasks.save(this.tasks.create(toCreate));
    }
  }

  private async findOwn(userId: number, id: number) {
    const task = await this.tasks.findOne({ where: { id, userId } });
    if (!task) throw new NotFoundException('할일을 찾을 수 없습니다.');
    return task;
  }
}
