import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

/**
 * 메모 항목(예: '알고리즘 풀이', '운동')에 대한 날짜별 기록 — "오늘 이거 N단위 했다".
 * 단위(unit)는 항목마다 다를 수 있음: 코딩이면 '문제', 운동이면 '분'/'시간' 등 자유 입력.
 */
@Entity('memo_item_logs')
export class MemoItemLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // 어느 메모 항목(상위든 하위든)에 대한 기록인지
  @Column()
  memoItemId: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 100 })
  label: string;

  @Column({ type: 'int', default: 1 })
  count: number;

  // 예: '문제', '분', '시간', '회' — 항목별로 자유롭게 정하고 다음엔 드롭다운으로 재사용
  @Column({ type: 'varchar', length: 20, default: '개' })
  unit: string;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
