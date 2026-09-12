import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BoardDocument = HydratedDocument<Board>;

@Schema({ timestamps: true, collection: 'boards' })
export class Board {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 80 })
  name!: string;

  @Prop({ default: false })
  isDefault!: boolean;

  /** lexorank among the project's boards */
  @Prop({ required: true })
  rank!: string;

  @Prop({ type: Date, default: null })
  archivedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const BoardSchema = SchemaFactory.createForClass(Board);
BoardSchema.index({ projectId: 1, rank: 1 });
