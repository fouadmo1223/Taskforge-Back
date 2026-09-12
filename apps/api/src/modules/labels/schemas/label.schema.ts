import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LabelDocument = HydratedDocument<Label>;

@Schema({ timestamps: true, collection: 'labels' })
export class Label {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  /** null = available across the whole workspace */
  @Prop({ type: Types.ObjectId, ref: 'Project', default: null, index: true })
  projectId!: Types.ObjectId | null;

  @Prop({ required: true, trim: true, maxlength: 40 })
  name!: string;

  @Prop({ type: String, default: '#64748b' })
  color!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const LabelSchema = SchemaFactory.createForClass(Label);
LabelSchema.index({ workspaceId: 1, projectId: 1, name: 1 }, { unique: true });
