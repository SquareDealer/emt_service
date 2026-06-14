import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../common/numeric.transformer';
import { WorkOrder } from './work-order.entity';
import { TaskTemplate } from './task-template.entity';

@Entity('labor_lines')
export class LaborLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'work_order_id', type: 'uuid' })
  work_order_id: string;

  @ManyToOne(() => WorkOrder, (w) => w.labor_lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_order_id' })
  work_order: WorkOrder;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  template_id: string | null;

  @ManyToOne(() => TaskTemplate, { nullable: true })
  @JoinColumn({ name: 'template_id' })
  template: TaskTemplate | null;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true, transformer: numericTransformer })
  hours: number | null;

  @Column({ name: 'rate_snapshot', type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  rate_snapshot: number;

  @Column({
    name: 'price_override',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  price_override: number | null;
}
