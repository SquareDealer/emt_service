import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Busy time on the calendar that is not a work order — a reserved lift, a
 * supplier visit, a day off. Deliberately outside `work_orders` so it never
 * reaches the board, the archive, the documents or the totals.
 */
@Entity('calendar_blocks')
export class CalendarBlock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Optional: the whole point is being able to block time without naming it. */
  @Column({ type: 'text', nullable: true })
  title: string | null;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  starts_at: Date;

  /** Same shape as work_orders.scheduled_duration_min, so the timeline can drag both. */
  @Column({ name: 'duration_min', type: 'int' })
  duration_min: number;

  /** NULL = shop-wide (everyone is busy). Otherwise it belongs to one master. */
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  user_id: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  created_by: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date;
}
