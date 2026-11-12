import { getMetadataArgsStorage } from 'typeorm';
import { PartLine } from './part-line.entity';
import { PartTemplate } from './part-template.entity';

describe('purchase_price', () => {
  it.each([PartLine, PartTemplate])('%p: nullable numeric, скрыта из выборок по умолчанию', (target) => {
    const col = getMetadataArgsStorage().columns.find(
      (c) => c.target === target && c.propertyName === 'purchase_price',
    );
    expect(col?.options).toMatchObject({ name: 'purchase_price', type: 'numeric', nullable: true, select: false });
  });
});
