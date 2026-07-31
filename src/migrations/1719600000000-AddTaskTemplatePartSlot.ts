import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The role a part plays in a work — «масло», «фильтр масляный», «колодки».
 *
 * Without it a generation-specific part cannot actually replace the universal
 * one: the R56 filter is a DIFFERENT catalog entry from the universal filter,
 * so keying the replacement on `part_template_id` never matches and the estimate
 * ends up with both filters. Rows sharing a slot are alternatives for the same
 * job; the one naming the car's generation wins. A row with no slot replaces
 * nothing and is simply always added.
 */
export class AddTaskTemplatePartSlot1719600000000 implements MigrationInterface {
  name = 'AddTaskTemplatePartSlot1719600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE task_template_parts ADD COLUMN IF NOT EXISTS slot text;`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE task_template_parts DROP COLUMN IF EXISTS slot;`);
  }
}
