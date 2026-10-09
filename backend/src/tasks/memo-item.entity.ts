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

/** 메모 탭 파일(월×분류) 안의 항목 — 제목 + 항목별 메모, 체크하면 Daily에서 선택 가능 */
@Entity('memo_items')
export class MemoItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 7 })
  month: string; // YYYY-MM

  @Column({ type: 'varchar', length: 50 })
  category: string;

  @Column({ type: 'varchar', length: 200 })
  text: string;

  // 상위 항목 id (null이면 최상위)
  @Column({ type: 'int', nullable: true })
  parentId: number | null;

  // 항목별 메모 (클릭해서 작성, 나중에 첨부파일 확장 예정)
  @Column({ type: 'text', nullable: true })
  content: string | null;

  // (폐기됨) 예전 배정 개념 — 데이터 보존 위해 컬럼만 유지
  @Column({ default: false })
  assigned: boolean;

  // 완료 여부 — Daily 할일 완료와 양방향 동기화, 메모 탭에서 직접 토글도 가능
  @Column({ default: false })
  completed: boolean;

  @Column({ type: 'int', default: 0 })
  position: number;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
