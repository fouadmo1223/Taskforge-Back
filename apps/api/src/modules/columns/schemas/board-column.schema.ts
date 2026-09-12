import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { STATUS_CATEGORIES, type StatusCategory } from '@flowdesk/types';

export type BoardColumnDocument = HydratedDocument<BoardColumn>;

@Schema({ timestamps: true, collection: 'board_columns' })
export class BoardColumn {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Board', required: true, index: true })
  boardId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 60 })
  name!: string;

  /** semantic bucket this column maps onto (drives reporting, done detection) */
  @Prop({ type: String, enum: STATUS_CATEGORIES, default: 'todo' })
  statusCategory!: StatusCategory;

  /** optional hex accent shown on the column header / cards; null = derive from status */
  @Prop({ type: String, default: null })
  color!: string | null;

  /** lexorank among the board's columns */
  @Prop({ required: true })
  rank!: string;

  /** 0 = no limit */
  @Prop({ default: 0, min: 0 })
  wipLimit!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const BoardColumnSchema = SchemaFactory.createForClass(BoardColumn);
BoardColumnSchema.index({ boardId: 1, rank: 1 });
