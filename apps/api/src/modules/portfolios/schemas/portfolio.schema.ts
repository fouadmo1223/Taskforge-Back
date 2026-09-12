import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PortfolioDocument = HydratedDocument<Portfolio>;

@Schema({ timestamps: true, collection: 'portfolios' })
export class Portfolio {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 160 })
  name!: string;

  @Prop({ default: '', maxlength: 2000 })
  description!: string;

  @Prop({ type: String, default: '#6366f1' })
  color!: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Project' }], default: [] })
  projectIds!: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  ownerUserId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId!: Types.ObjectId;

  @Prop({ type: Date, default: null, index: true })
  archivedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PortfolioSchema = SchemaFactory.createForClass(Portfolio);
PortfolioSchema.index({ workspaceId: 1, archivedAt: 1 });
