import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { DASHBOARD_WIDGET_TYPES, type DashboardWidgetType } from '@flowdesk/types';

export type DashboardDocument = HydratedDocument<Dashboard>;

@Schema({ _id: true })
export class DashboardWidget {
  @Prop({ type: Types.ObjectId, auto: true }) _id!: Types.ObjectId;
  @Prop({ type: String, enum: DASHBOARD_WIDGET_TYPES, required: true }) type!: DashboardWidgetType;
  @Prop({ required: true, maxlength: 120 }) title!: string;
  /** one of: task_count | project_status | throughput | priority_breakdown */
  @Prop({ required: true, maxlength: 40 }) source!: string;
  @Prop({ type: Object, default: {} }) config!: Record<string, unknown>;
  @Prop({ type: Object, default: { x: 0, y: 0, w: 4, h: 3 } }) layout!: { x: number; y: number; w: number; h: number };
}
const DashboardWidgetSchema = SchemaFactory.createForClass(DashboardWidget);

@Schema({ timestamps: true, collection: 'dashboards' })
export class Dashboard {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 160 })
  name!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerUserId!: Types.ObjectId;

  /** visible to every workspace member (still read-only for non-owners) */
  @Prop({ default: false })
  shared!: boolean;

  @Prop({ type: [DashboardWidgetSchema], default: [] })
  widgets!: DashboardWidget[];

  createdAt!: Date;
  updatedAt!: Date;
}

export const DashboardSchema = SchemaFactory.createForClass(Dashboard);
DashboardSchema.index({ workspaceId: 1, ownerUserId: 1 });
