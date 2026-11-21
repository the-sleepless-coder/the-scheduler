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

/** 날짜 × 분류 단위 메모 — Daily "빠른 메모"에서 작성, Memo 탭에서는 목록으로 조회 */
@Entity('month_memos')
export class MonthMemo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 7 })
  month: string; // YYYY-MM

  @Column({ type: 'varchar', length: 10 })
  date: string; // YYYY-MM-DD — Daily 빠른 메모를 작성한 날짜, 폴더당 하루에 한 항목

  @Column({ type: 'varchar', length: 50 })
  category: string;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
