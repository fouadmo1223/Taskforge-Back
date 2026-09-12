import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { FormFieldType, FormVisibility, TaskPriority } from '@flowdesk/types';
import { slugWithSuffix } from '@flowdesk/utils';
import { ApiException } from '../../common/http/api-exception.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { RequestsService } from './requests.service.js';
import {
  Form,
  FormSubmission,
  type FormDocument,
  type FormSubmissionDocument,
} from './schemas/form.schema.js';

export interface FormFieldInput {
  id?: string;
  type: FormFieldType;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
}

export interface FormRoutingInput {
  enabled?: boolean;
  projectId?: string | null;
  assigneeUserId?: string | null;
  priority?: TaskPriority;
}

export interface CreateFormInput {
  title: string;
  description?: string;
  projectId?: string | null;
  visibility?: FormVisibility;
  fields?: FormFieldInput[];
  successMessage?: string;
  routing?: FormRoutingInput;
}

export interface FormFieldView {
  id: string;
  type: FormFieldType;
  label: string;
  description: string;
  placeholder: string;
  required: boolean;
  options: { label: string; value: string }[];
  order: number;
}

export interface FormView {
  id: string;
  title: string;
  description: string;
  slug: string;
  projectId: string | null;
  visibility: FormVisibility;
  status: 'draft' | 'published' | 'closed';
  fields: FormFieldView[];
  successMessage: string;
  routing: {
    enabled: boolean;
    projectId: string | null;
    assigneeUserId: string | null;
    priority: TaskPriority;
  };
  submissionCount: number;
  createdAt: string;
  updatedAt: string;
}

/** What an unauthenticated visitor is allowed to see about a published form. */
export interface PublicFormView {
  title: string;
  description: string;
  slug: string;
  fields: FormFieldView[];
  successMessage: string;
}

const CHOICE_TYPES: ReadonlySet<FormFieldType> = new Set(['radio', 'select', 'multi_select']);

@Injectable()
export class FormsService {
  constructor(
    @InjectModel(Form.name) private readonly model: Model<FormDocument>,
    @InjectModel(FormSubmission.name) private readonly submissions: Model<FormSubmissionDocument>,
    private readonly requests: RequestsService,
    private readonly realtime: RealtimeService,
  ) {}

  list(workspaceId: string, opts: { status?: string } = {}): Promise<FormDocument[]> {
    const filter: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId), deletedAt: null };
    if (opts.status) filter.status = opts.status;
    return this.model.find(filter).sort({ updatedAt: -1 }).exec();
  }

  async getOrThrow(workspaceId: string, formId: string): Promise<FormDocument> {
    const form = await this.model
      .findOne({ _id: formId, workspaceId: new Types.ObjectId(workspaceId), deletedAt: null })
      .exec();
    if (!form) throw ApiException.notFound('Form');
    return form;
  }

  async create(workspaceId: string, userId: string, input: CreateFormInput): Promise<FormDocument> {
    const fields = this.normalizeFields(input.fields ?? []);
    return this.model.create({
      workspaceId: new Types.ObjectId(workspaceId),
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      slug: slugWithSuffix(input.title),
      projectId: input.projectId ? new Types.ObjectId(input.projectId) : null,
      visibility: input.visibility ?? 'private',
      status: 'draft',
      fields,
      successMessage: input.successMessage?.trim() || 'Thanks — we’ve received your submission.',
      routing: this.normalizeRouting(input.routing),
      createdByUserId: new Types.ObjectId(userId),
    });
  }

  async update(
    workspaceId: string,
    formId: string,
    patch: Partial<CreateFormInput> & { status?: 'draft' | 'published' | 'closed' },
    actorId: string,
  ): Promise<FormDocument> {
    const form = await this.getOrThrow(workspaceId, formId);
    if (patch.title !== undefined) form.title = patch.title.trim();
    if (patch.description !== undefined) form.description = patch.description.trim();
    if (patch.projectId !== undefined) form.projectId = patch.projectId ? new Types.ObjectId(patch.projectId) : null;
    if (patch.visibility !== undefined) form.visibility = patch.visibility;
    if (patch.successMessage !== undefined) {
      form.successMessage = patch.successMessage.trim() || form.successMessage;
    }
    if (patch.fields !== undefined) form.fields = this.normalizeFields(patch.fields);
    if (patch.routing !== undefined) form.routing = this.normalizeRouting(patch.routing);
    if (patch.status !== undefined) {
      if (!['draft', 'published', 'closed'].includes(patch.status)) throw ApiException.validation('Invalid status.');
      if (patch.status === 'published' && form.fields.length === 0) {
        throw ApiException.validation('Add at least one field before publishing.');
      }
      form.status = patch.status;
    }
    await form.save();
    this.realtime.emitToWorkspace(workspaceId, 'form.updated', { form: this.toView(form) }, actorId);
    return form;
  }

  async softDelete(workspaceId: string, formId: string, actorId: string): Promise<void> {
    const form = await this.getOrThrow(workspaceId, formId);
    form.deletedAt = new Date();
    await form.save();
    this.realtime.emitToWorkspace(workspaceId, 'form.updated', { form: this.toView(form), deleted: true }, actorId);
  }

  listSubmissions(workspaceId: string, formId: string): Promise<FormSubmissionDocument[]> {
    return this.submissions
      .find({ workspaceId: new Types.ObjectId(workspaceId), formId: new Types.ObjectId(formId) })
      .sort({ createdAt: -1 })
      .limit(500)
      .exec();
  }

  // ── public surface ──────────────────────────────────────────────────────

  async publicBySlug(slug: string): Promise<FormDocument> {
    const form = await this.model.findOne({ slug, status: 'published', deletedAt: null }).exec();
    if (!form || form.visibility === 'private') throw ApiException.notFound('Form');
    return form;
  }

  async submit(
    slug: string,
    body: { answers: Record<string, unknown>; submitterName?: string; submitterEmail?: string },
    meta: { ip?: string | null; userId?: string | null },
  ): Promise<{ form: FormDocument; submission: FormSubmissionDocument; message: string }> {
    const form = await this.publicBySlug(slug);
    const answers = this.validateAnswers(form, body.answers ?? {});

    const submission = await this.submissions.create({
      workspaceId: form.workspaceId,
      formId: form._id,
      answers,
      submitterUserId: meta.userId ? new Types.ObjectId(meta.userId) : null,
      submitterName: body.submitterName?.trim() ?? '',
      submitterEmail: body.submitterEmail?.toLowerCase().trim() ?? '',
      ip: meta.ip ?? null,
    });

    await this.model.updateOne({ _id: form._id }, { $inc: { submissionCount: 1 } }).exec();

    if (form.routing.enabled) {
      const title = this.deriveRequestTitle(form, answers);
      const request = await this.requests.create(form.workspaceId.toString(), {
        title,
        description: this.deriveRequestBody(form, answers),
        priority: form.routing.priority,
        source: 'form',
        formId: form.id,
        formSubmissionId: submission.id,
        projectId: form.routing.projectId?.toString() ?? form.projectId?.toString() ?? null,
        assigneeUserId: form.routing.assigneeUserId?.toString() ?? null,
        requesterUserId: meta.userId ?? null,
        requesterName: body.submitterName?.trim() ?? '',
        requesterEmail: body.submitterEmail?.toLowerCase().trim() ?? '',
      });
      submission.requestId = request._id as Types.ObjectId;
      await submission.save();
    }

    return { form, submission, message: form.successMessage };
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private normalizeFields(fields: FormFieldInput[]): FormDocument['fields'] {
    return fields.map((f, i) => {
      if (CHOICE_TYPES.has(f.type) && (!f.options || f.options.length === 0)) {
        throw ApiException.validation(`Field "${f.label}" needs at least one option.`);
      }
      return {
        id: f.id?.trim() || new Types.ObjectId().toString(),
        type: f.type,
        label: f.label.trim(),
        description: f.description?.trim() ?? '',
        placeholder: f.placeholder?.trim() ?? '',
        required: Boolean(f.required),
        options: (f.options ?? []).map((o) => ({ label: o.label.trim(), value: o.value.trim() })),
        order: i,
      };
    }) as FormDocument['fields'];
  }

  private normalizeRouting(routing?: FormRoutingInput): FormDocument['routing'] {
    return {
      enabled: Boolean(routing?.enabled),
      projectId: routing?.projectId ? new Types.ObjectId(routing.projectId) : null,
      assigneeUserId: routing?.assigneeUserId ? new Types.ObjectId(routing.assigneeUserId) : null,
      priority: routing?.priority ?? 'medium',
    } as FormDocument['routing'];
  }

  /** Enforces required + shape rules; returns the answer map trimmed to known fields. */
  private validateAnswers(form: FormDocument, raw: Record<string, unknown>): Record<string, unknown> {
    const clean: Record<string, unknown> = {};
    for (const field of form.fields) {
      const value = raw[field.id];
      const empty =
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim() === '') ||
        (Array.isArray(value) && value.length === 0);

      if (empty) {
        if (field.required) throw ApiException.validation(`"${field.label}" is required.`);
        continue;
      }

      if (field.type === 'multi_select') {
        if (!Array.isArray(value)) throw ApiException.validation(`"${field.label}" must be a list.`);
        const allowed = new Set(field.options.map((o) => o.value));
        for (const v of value) {
          if (!allowed.has(String(v))) throw ApiException.validation(`"${field.label}" has an invalid choice.`);
        }
        clean[field.id] = value.map(String);
        continue;
      }

      if (CHOICE_TYPES.has(field.type)) {
        const allowed = new Set(field.options.map((o) => o.value));
        if (!allowed.has(String(value))) throw ApiException.validation(`"${field.label}" has an invalid choice.`);
      }

      if (field.type === 'number' && Number.isNaN(Number(value))) {
        throw ApiException.validation(`"${field.label}" must be a number.`);
      }
      if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
        throw ApiException.validation(`"${field.label}" must be a valid email.`);
      }

      clean[field.id] = typeof value === 'string' ? value.slice(0, 10_000) : value;
    }
    return clean;
  }

  private deriveRequestTitle(form: FormDocument, answers: Record<string, unknown>): string {
    const firstText = form.fields.find((f) => ['text', 'textarea'].includes(f.type) && answers[f.id]);
    const snippet = firstText ? String(answers[firstText.id]).slice(0, 120) : '';
    return snippet ? `${form.title}: ${snippet}` : `${form.title} submission`;
  }

  private deriveRequestBody(form: FormDocument, answers: Record<string, unknown>): string {
    return form.fields
      .filter((f) => answers[f.id] !== undefined)
      .map((f) => {
        const v = answers[f.id];
        return `${f.label}: ${Array.isArray(v) ? v.join(', ') : String(v)}`;
      })
      .join('\n');
  }

  toView(f: FormDocument): FormView {
    return {
      id: f.id,
      title: f.title,
      description: f.description,
      slug: f.slug,
      projectId: f.projectId?.toString() ?? null,
      visibility: f.visibility,
      status: f.status,
      fields: f.fields.map((x) => ({
        id: x.id,
        type: x.type,
        label: x.label,
        description: x.description,
        placeholder: x.placeholder,
        required: x.required,
        options: x.options.map((o) => ({ label: o.label, value: o.value })),
        order: x.order,
      })),
      successMessage: f.successMessage,
      routing: {
        enabled: f.routing.enabled,
        projectId: f.routing.projectId?.toString() ?? null,
        assigneeUserId: f.routing.assigneeUserId?.toString() ?? null,
        priority: f.routing.priority,
      },
      submissionCount: f.submissionCount,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    };
  }

  toPublicView(f: FormDocument): PublicFormView {
    return {
      title: f.title,
      description: f.description,
      slug: f.slug,
      fields: f.fields.map((x) => ({
        id: x.id,
        type: x.type,
        label: x.label,
        description: x.description,
        placeholder: x.placeholder,
        required: x.required,
        options: x.options.map((o) => ({ label: o.label, value: o.value })),
        order: x.order,
      })),
      successMessage: f.successMessage,
    };
  }

  submissionView(s: FormSubmissionDocument): {
    id: string;
    formId: string;
    answers: Record<string, unknown>;
    submitterName: string;
    submitterEmail: string;
    requestId: string | null;
    createdAt: string;
  } {
    return {
      id: s.id,
      formId: s.formId.toString(),
      answers: s.answers,
      submitterName: s.submitterName,
      submitterEmail: s.submitterEmail,
      requestId: s.requestId?.toString() ?? null,
      createdAt: s.createdAt.toISOString(),
    };
  }
}
