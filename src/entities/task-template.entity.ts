import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../common/numeric.transformer';

@Entity('task_templates')
export class TaskTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'default_hours', type: 'numeric', precision: 6, scale: 2, nullable: true, transformer: numericTransformer })
  default_hours: number | null;

  @Column({ name: 'default_price', type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: numericTransformer })
  default_price: number | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;
}
