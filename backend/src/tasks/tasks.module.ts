import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HiddenFolder } from './hidden-folder.entity';
import { MemoItemLog } from './memo-item-log.entity';
import { MemoItemLogsController } from './memo-item-logs.controller';
import { MemoItem } from './memo-item.entity';
import { MemoItemsController } from './memo-items.controller';
import { MindTopic } from './mind-topic.entity';
import { MindTopicsController } from './mind-topics.controller';
import { MonthMemo } from './month-memo.entity';
import { MonthMemosController } from './month-memos.controller';
import { PeriodItem } from './period-item.entity';
import { PeriodItemsController } from './period-items.controller';
import { RecurringController } from './recurring.controller';
import { RecurringItem } from './recurring.entity';
import { Task } from './task.entity';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { WeekItem } from './week-item.entity';
import { WeekItemsController } from './week-items.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Task,
      RecurringItem,
      WeekItem,
      PeriodItem,
      MonthMemo,
      MemoItem,
      MindTopic,
      HiddenFolder,
      MemoItemLog,
    ]),
  ],
  controllers: [
    TasksController,
    RecurringController,
    WeekItemsController,
    PeriodItemsController,
    MonthMemosController,
    MemoItemsController,
    MindTopicsController,
    MemoItemLogsController,
  ],
  providers: [TasksService],
})
export class TasksModule {}
