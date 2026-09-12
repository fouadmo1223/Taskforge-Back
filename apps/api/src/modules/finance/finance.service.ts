import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { ExpenseStatus } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { Budget, type BudgetDocument } from './schemas/budget.schema.js';
import { Expense, type ExpenseDocument } from './schemas/expense.schema.js';

export interface BudgetView {
  projectId: string;
  currency: string;
  amount: number;
  categories: { name: string; amount: number }[];
  notes: string;
  updatedAt: string | null;
}

export interface ExpenseView {
  id: string;
  projectId: string;
  taskId: string | null;
  description: string;
  amount: number;
  currency: string;
  category: string;
  spentAt: string;
  billable: boolean;
  status: ExpenseStatus;
  receiptUrl: string | null;
  submittedByUserId: string;
  reviewedByUserId: string | null;
  reviewNote: string;
  createdAt: string;
}

export interface FinanceSummary {
  projectId: string;
  currency: string;
  budget: number;
  committed: number; // submitted, not yet approved
  spent: number; // approved + reimbursed
  billable: number; // approved + reimbursed AND billable
  remaining: number;
  byCategory: { name: string; budget: number; spent: number }[];
}

const SPENT_STATES: ExpenseStatus[] = ['approved', 'reimbursed'];

@Injectable()
export class FinanceService {
  constructor(
    @InjectModel(Budget.name) private readonly budgets: Model<BudgetDocument>,
    @InjectModel(Expense.name) private readonly expenses: Model<ExpenseDocument>,
    private readonly projects: ProjectsService,
    private readonly realtime: RealtimeService,
  ) {}

  // ── budget ──────────────────────────────────────────────────────────────

  async getBudget(workspaceId: string, projectId: string): Promise<BudgetView> {
    await this.projects.getOrThrow(workspaceId, projectId);
    const doc = await this.budgets.findOne({ projectId: new Types.ObjectId(projectId) }).exec();
    return doc
      ? this.budgetView(doc)
      : { projectId, currency: 'USD', amount: 0, categories: [], notes: '', updatedAt: null };
  }

  async setBudget(
    workspaceId: string,
    projectId: string,
    userId: string,
    input: { currency?: string; amount?: number; categories?: { name: string; amount: number }[]; notes?: string },
  ): Promise<BudgetView> {
    await this.projects.getOrThrow(workspaceId, projectId);
    if (input.amount !== undefined && input.amount < 0) throw ApiException.validation('Budget cannot be negative.');
    const doc = await this.budgets.findOneAndUpdate(
      { projectId: new Types.ObjectId(projectId) },
      {
        $set: {
          workspaceId: new Types.ObjectId(workspaceId),
          projectId: new Types.ObjectId(projectId),
          ...(input.currency !== undefined ? { currency: input.currency.toUpperCase() } : {}),
          ...(input.amount !== undefined ? { amount: input.amount } : {}),
          ...(input.categories !== undefined
            ? { categories: input.categories.map((c) => ({ name: c.name.trim(), amount: Math.max(0, c.amount) })) }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes.trim() } : {}),
          updatedByUserId: new Types.ObjectId(userId),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();
    this.realtime.emitToWorkspace(workspaceId, 'budget.updated', { budget: this.budgetView(doc) }, userId);
    return this.budgetView(doc);
  }

  // ── expenses ────────────────────────────────────────────────────────────

  list(workspaceId: string, opts: { projectId?: string; status?: ExpenseStatus } = {}): Promise<ExpenseDocument[]> {
    const filter: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId) };
    if (opts.projectId) filter.projectId = new Types.ObjectId(opts.projectId);
    if (opts.status) filter.status = opts.status;
    return this.expenses.find(filter).sort({ spentAt: -1 }).limit(500).exec();
  }

  async getOrThrow(workspaceId: string, expenseId: string): Promise<ExpenseDocument> {
    const doc = await this.expenses.findOne({ _id: expenseId, workspaceId: new Types.ObjectId(workspaceId) }).exec();
    if (!doc) throw ApiException.notFound('Expense');
    return doc;
  }

  async create(
    workspaceId: string,
    userId: string,
    input: {
      projectId: string;
      description: string;
      amount: number;
      currency?: string;
      category?: string;
      spentAt: string;
      billable?: boolean;
      taskId?: string | null;
      receipt?: ExpenseDocument['receipt'];
    },
  ): Promise<ExpenseDocument> {
    await this.projects.getOrThrow(workspaceId, input.projectId);
    if (input.amount <= 0) throw ApiException.validation('Amount must be greater than zero.');
    const doc = await this.expenses.create({
      workspaceId: new Types.ObjectId(workspaceId),
      projectId: new Types.ObjectId(input.projectId),
      taskId: input.taskId ? new Types.ObjectId(input.taskId) : null,
      description: input.description.trim(),
      amount: input.amount,
      currency: (input.currency ?? 'USD').toUpperCase(),
      category: input.category?.trim() ?? '',
      spentAt: new Date(input.spentAt),
      billable: Boolean(input.billable),
      receipt: input.receipt ?? null,
      submittedByUserId: new Types.ObjectId(userId),
    });
    this.emitExpense(workspaceId, doc, userId);
    return doc;
  }

  async update(
    workspaceId: string,
    expenseId: string,
    userId: string,
    patch: Partial<{
      description: string;
      amount: number;
      currency: string;
      category: string;
      spentAt: string;
      billable: boolean;
      taskId: string | null;
    }>,
  ): Promise<ExpenseDocument> {
    const doc = await this.getOrThrow(workspaceId, expenseId);
    if (doc.status !== 'draft' && doc.status !== 'rejected') {
      throw ApiException.validation('Only draft or rejected expenses can be edited.');
    }
    if (patch.description !== undefined) doc.description = patch.description.trim();
    if (patch.amount !== undefined) {
      if (patch.amount <= 0) throw ApiException.validation('Amount must be greater than zero.');
      doc.amount = patch.amount;
    }
    if (patch.currency !== undefined) doc.currency = patch.currency.toUpperCase();
    if (patch.category !== undefined) doc.category = patch.category.trim();
    if (patch.spentAt !== undefined) doc.spentAt = new Date(patch.spentAt);
    if (patch.billable !== undefined) doc.billable = patch.billable;
    if (patch.taskId !== undefined) doc.taskId = patch.taskId ? new Types.ObjectId(patch.taskId) : null;
    await doc.save();
    this.emitExpense(workspaceId, doc, userId);
    return doc;
  }

  async submit(workspaceId: string, expenseId: string, userId: string): Promise<ExpenseDocument> {
    const doc = await this.getOrThrow(workspaceId, expenseId);
    if (doc.status !== 'draft' && doc.status !== 'rejected') {
      throw ApiException.validation('This expense has already been submitted.');
    }
    doc.status = 'submitted';
    doc.reviewedByUserId = null;
    doc.reviewNote = '';
    doc.reviewedAt = null;
    await doc.save();
    this.emitExpense(workspaceId, doc, userId);
    return doc;
  }

  async review(
    workspaceId: string,
    expenseId: string,
    userId: string,
    decision: 'approve' | 'reject' | 'reimburse',
    note?: string,
  ): Promise<ExpenseDocument> {
    const doc = await this.getOrThrow(workspaceId, expenseId);
    if (decision === 'reimburse') {
      if (doc.status !== 'approved') throw ApiException.validation('Only approved expenses can be marked reimbursed.');
      doc.status = 'reimbursed';
    } else {
      if (doc.status !== 'submitted') throw ApiException.validation('Only submitted expenses can be reviewed.');
      doc.status = decision === 'approve' ? 'approved' : 'rejected';
    }
    doc.reviewedByUserId = new Types.ObjectId(userId);
    doc.reviewNote = note?.slice(0, 1000) ?? '';
    doc.reviewedAt = new Date();
    await doc.save();
    this.emitExpense(workspaceId, doc, userId);
    return doc;
  }

  async remove(workspaceId: string, expenseId: string, userId: string): Promise<void> {
    const doc = await this.getOrThrow(workspaceId, expenseId);
    await this.expenses.deleteOne({ _id: doc._id });
    this.realtime.emitToWorkspace(workspaceId, 'expense.updated', { expenseId, deleted: true }, userId);
  }

  // ── summary ─────────────────────────────────────────────────────────────

  async summary(workspaceId: string, projectId: string): Promise<FinanceSummary> {
    const [budget, expenses] = await Promise.all([
      this.getBudget(workspaceId, projectId),
      this.list(workspaceId, { projectId }),
    ]);

    let committed = 0;
    let spent = 0;
    let billable = 0;
    const catSpent = new Map<string, number>();

    for (const e of expenses) {
      if (e.status === 'submitted') committed += e.amount;
      if (SPENT_STATES.includes(e.status)) {
        spent += e.amount;
        if (e.billable) billable += e.amount;
        catSpent.set(e.category || 'Uncategorized', (catSpent.get(e.category || 'Uncategorized') ?? 0) + e.amount);
      }
    }

    const catNames = new Set<string>([...budget.categories.map((c) => c.name), ...catSpent.keys()]);
    const byCategory = [...catNames].map((name) => ({
      name,
      budget: budget.categories.find((c) => c.name === name)?.amount ?? 0,
      spent: catSpent.get(name) ?? 0,
    }));

    return {
      projectId,
      currency: budget.currency,
      budget: budget.amount,
      committed,
      spent,
      billable,
      remaining: budget.amount - spent - committed,
      byCategory,
    };
  }

  // ── views ───────────────────────────────────────────────────────────────

  private emitExpense(workspaceId: string, doc: ExpenseDocument, actorId: string): void {
    this.realtime.emitToWorkspace(workspaceId, 'expense.updated', { expense: this.expenseView(doc) }, actorId);
  }

  budgetView(b: BudgetDocument): BudgetView {
    return {
      projectId: b.projectId.toString(),
      currency: b.currency,
      amount: b.amount,
      categories: b.categories.map((c) => ({ name: c.name, amount: c.amount })),
      notes: b.notes,
      updatedAt: b.updatedAt?.toISOString() ?? null,
    };
  }

  expenseView(e: ExpenseDocument): ExpenseView {
    return {
      id: e.id,
      projectId: e.projectId.toString(),
      taskId: e.taskId?.toString() ?? null,
      description: e.description,
      amount: e.amount,
      currency: e.currency,
      category: e.category,
      spentAt: e.spentAt.toISOString(),
      billable: e.billable,
      status: e.status,
      receiptUrl: e.receipt?.secureUrl ?? null,
      submittedByUserId: e.submittedByUserId.toString(),
      reviewedByUserId: e.reviewedByUserId?.toString() ?? null,
      reviewNote: e.reviewNote,
      createdAt: e.createdAt.toISOString(),
    };
  }
}
