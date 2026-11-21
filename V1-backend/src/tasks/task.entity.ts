import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  title: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string | null;

  @Column({ type: 'date' })
  date: string;

  @Column({ default: false })
  completed: boolean;

  // 할일 클릭 시 작성하는 메모
  @Column({ type: 'text', nullable: true })
  memo: string | null;

  // 오늘 선택한 하위 항목 (memo_items.id) — 메모가 이 하위 기준으로 열림
  @Column({ type: 'int', nullable: true })
  subItemId: number | null;

  // 타임박스에서 복사한 블록이면 원본 할일 id.
  // 복사본은 Time Boxing에만 뜨고 To Do 목록에는 안 나온다.
  @Column({ type: 'int', nullable: true })
  parentTaskId: number | null;

  // To Do 목록 내 정렬 순서 (드래그로 변경)
  @Column({ type: 'int', default: 0 })
  position: number;

  // Chores 체크리스트에 배정됐는지
  @Column({ default: false })
  isChore: boolean;

  // ★ 우선순위 높음 — To Do 목록에서 맨 위로 보여줌 (토글)
  @Column({ default: false })
  highPriority: boolean;

  // 1~3이면 Today's Top 3, null이면 일반 할일
  @Column({ type: 'tinyint', nullable: true })
  top3Order: number | null;

  // recurring 아이템에서 자동 생성된 할일이면 원본 id
  @Column({ type: 'int', nullable: true })
  recurringId: number | null;

  // 주간 할일(week item)에서 자동 생성된 할일이면 원본 id
  @Column({ type: 'int', nullable: true })
  weekItemId: number | null;

  // 기간 할일(period item)에서 자동 생성된 할일이면 원본 id
  @Column({ type: 'int', nullable: true })
  periodItemId: number | null;

  // 타임박싱용 'HH:mm', 아직 배치 전이면 null
  @Column({ type: 'varchar', length: 5, nullable: true })
  startTime: string | null;

  @Column({ type: 'varchar', length: 5, nullable: true })
  endTime: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
