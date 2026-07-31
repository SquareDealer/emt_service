import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../common/numeric.transformer';
import { TaskTemplate } from './task-template.entity';
import { PartTemplate } from './part-template.entity';
import { VehicleGeneration } from './vehicle-generation.entity';

/**
 * A part a work normally consumes — what turns a price-list entry into
 * «работа + её запчасти».
 *
 * Resolution when the template is applied to a car:
 *   • rows with `generation_id IS NULL` always apply;
 *   • a row naming the car's generation REPLACES the universal row in the SAME
 *     `slot`. Matching on `part_template_id` would never fire — the R56 filter
 *     is a different catalog entry — and swapping the whole set would mean that
 *     adding one R56-specific filter silently drops the oil.
 */
@Entity('task_template_parts')
export class TaskTemplatePart {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'task_template_id', type: 'uuid' })
  task_template_id: string;

  @ManyToOne(() => TaskTemplate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_template_id' })
  task_template: TaskTemplate;

  @Column({ name: 'part_template_id', type: 'uuid' })
  part_template_id: string;

  @ManyToOne(() => PartTemplate, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'part_template_id' })
  part_template: PartTemplate;

  /**
   * Role of this part in the work — «масло», «фильтр масляный». Rows sharing a
   * slot are alternatives; the one naming the car's generation wins. NULL means
   * the part stands alone and never replaces anything.
   */
  @Column({ type: 'text', nullable: true })
  slot: string | null;

  /** NULL = for every generation. */
  @Column({ name: 'generation_id', type: 'uuid', nullable: true })
  generation_id: string | null;

  @ManyToOne(() => VehicleGeneration, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'generation_id' })
  generation: VehicleGeneration | null;

  @Column({ type: 'numeric', precision: 12, scale: 3, nullable: true, transformer: numericTransformer })
  qty: number | null;

  /** false = offered on the confirmation sheet, but not ticked. */
  @Column({ name: 'is_default', type: 'boolean', default: true })
  is_default: boolean;
}
