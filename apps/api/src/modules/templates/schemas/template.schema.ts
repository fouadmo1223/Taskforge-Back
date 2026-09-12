import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TEMPLATE_KINDS, type TemplateKind } from '@flowdesk/types';

export type TemplateDocument = HydratedDocument<Template>;

/**
 * `payload` shape by kind:
 *  - task:    { title, description?, priority?, estimateHours?, subtasks?: TaskNode[] }
 *  - project: { columns?: {name, statusCategory}[], tasks?: TaskNode[] }
 * where TaskNode = { title, description?, priority?, estimateHours?, subtasks?: TaskNode[] }
 */
@Schema({ timestamps: true, collection: 'templates' })
export class Template {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: String, enum: TEMPLATE_KINDS, required: true, index: true })
  kind!: TemplateKind;

  @Prop({ required: true, trim: true, maxlength: 160 })
  name!: string;

  @Prop({ default: '', maxlength: 2000 })
  description!: string;

  @Prop({ type: Object, default: {} })
  payload!: Record<string, unknown>;

  @Prop({ default: 0 })
  useCount!: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const TemplateSchema = SchemaFactory.createForClass(Template);
TemplateSchema.index({ workspaceId: 1, kind: 1 });
