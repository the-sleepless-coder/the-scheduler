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

/** 특정 주(월요일 날짜 기준)에 해야 할 일 — 그 주 동안 매일 Daily로 들어감 */
@Entity('week_items')
export class WeekItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // 그 주 월요일 (YYYY-MM-DD)
  @Column({ type: 'date' })
  weekStart: string;

  @Column()
  title: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string | null;

  // 적용 요일: weekStart 기준 오프셋 "0,2,4" (0=월). null이면 매일
  @Column({ type: 'varchar', length: 20, nullable: true })
  days: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
