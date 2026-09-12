import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AvailabilityDocument = HydratedDocument<Availability>;

@Schema({ timestamps: true, collection: 'availability' })
export class Availability {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ default: 40, min: 0, max: 168 })
  weeklyHours!: number;

  /** ISO weekday numbers that count as working days (1 = Mon … 7 = Sun) */
  @Prop({ type: [Number], default: [1, 2, 3, 4, 5] })
  workingDays!: number[];

  @Prop({ default: 8, min: 0, max: 24 })
  hoursPerDay!: number;

  @Prop({ type: String, default: 'UTC' })
  timezone!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AvailabilitySchema = SchemaFactory.createForClass(Availability);
AvailabilitySchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export type AvailabilityExceptionDocument = HydratedDocument<AvailabilityException>;

@Schema({ timestamps: true, collection: 'availability_exceptions' })
export class AvailabilityException {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  /** null = applies to the whole workspace (a public holiday) */
  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  userId!: Types.ObjectId | null;

  @Prop({ type: String, enum: ['leave', 'holiday', 'partial'], required: true })
  type!: 'leave' | 'holiday' | 'partial';

  @Prop({ required: true })
  from!: Date;

  @Prop({ required: true })
  to!: Date;

  /** hours still available per day during a `partial` exception (ignored otherwise) */
  @Prop({ default: 0, min: 0, max: 24 })
  hoursPerDay!: number;

  @Prop({ default: '', maxlength: 200 })
  note!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AvailabilityExceptionSchema = SchemaFactory.createForClass(AvailabilityException);
AvailabilityExceptionSchema.index({ workspaceId: 1, from: 1, to: 1 });
AvailabilityExceptionSchema.index({ workspaceId: 1, userId: 1, from: 1 });
