import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { numericTransformer } from '../common/numeric.transformer';
import { TaskTemplate } from './task-template.entity';
import { VehicleGeneration } from './vehicle-generation.entity';

/**
 * A per-generation OVERRIDE of a work's price. The base stays on
 * `task_templates.default_hours` / `default_price`; a row here only exists where
 * the shop charges something different for that generation.
 *
 * Both columns are nullable so a generation can override just the hours, or just
 * the price, without inventing a value for the other.
 */
@Entity('template_generation_prices')
@Unique('uq_template_generation', ['template_id', 'generation_id'])
export class TemplateGenerationPrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'template_id', type: 'uuid' })
  template_id: string;

  @ManyToOne(() => TaskTemplate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template: TaskTemplate;

  @Column({ name: 'generation_id', type: 'uuid' })
  generation_id: string;

  @ManyToOne(() => VehicleGeneration, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'generation_id' })
  generation: VehicleGeneration;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true, transformer: numericTransformer })
  hours: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: numericTransformer })
  price: number | null;
}
