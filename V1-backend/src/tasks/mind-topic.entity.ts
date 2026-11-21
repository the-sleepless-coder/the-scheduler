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

/** What's on my mind — 집중 주제. 월(YYYY-MM) 또는 주(월요일 YYYY-MM-DD) 단위 */
@Entity('mind_topics')
export class MindTopic {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // 'YYYY-MM' = 월간 주제, 'YYYY-MM-DD' = 그 주(월요일) 주제
  @Column({ type: 'varchar', length: 10 })
  month: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  // '폴더 만들기'를 누르면 아래 폴더 목록에도 파일로 등장
  @Column({ default: false })
  isFolder: boolean;

  // 주제별 메모 (칩 클릭해서 작성)
  @Column({ type: 'text', nullable: true })
  content: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
