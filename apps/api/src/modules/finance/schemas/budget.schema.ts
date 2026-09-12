import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BudgetDocument = HydratedDocument<Budget>;

@Schema({ _id: false })
export class BudgetCategory {
  @Prop({ required: true, trim: true, maxlength: 80 }) name!: string;
  @Prop({ required: true, min: 0 }) amount!: number;
}
const BudgetCategorySchema = SchemaFactory.createForClass(BudgetCategory);

@Schema({ timestamps: true, collection: 'budgets' })
export class Budget {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  /** one budget per project */
  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, unique: true })
  projectId!: Types.ObjectId;

  @Prop({ type: String, default: 'USD', maxlength: 3, uppercase: true })
  currency!: string;

  @Prop({ default: 0, min: 0 })
  amount!: number;

  @Prop({ type: [BudgetCategorySchema], default: [] })
  categories!: BudgetCategory[];

  @Prop({ default: '', maxlength: 2000 })
  notes!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  updatedByUserId!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const BudgetSchema = SchemaFactory.createForClass(Budget);
