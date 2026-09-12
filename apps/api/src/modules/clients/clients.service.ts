import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApiException } from '../../common/http/api-exception.js';
import { Client, type ClientDocument } from './schemas/client.schema.js';

export interface ClientView {
  id: string;
  name: string;
  logo: ClientDocument['logo'];
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  notes: string;
  status: 'active' | 'archived';
  projectIds: string[];
  createdAt: string;
}

@Injectable()
export class ClientsService {
  constructor(@InjectModel(Client.name) private readonly model: Model<ClientDocument>) {}

  list(workspaceId: string, opts: { includeArchived?: boolean } = {}): Promise<ClientDocument[]> {
    const filter: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId), deletedAt: null };
    if (!opts.includeArchived) filter.status = 'active';
    return this.model.find(filter).sort({ name: 1 }).exec();
  }

  async getOrThrow(workspaceId: string, clientId: string): Promise<ClientDocument> {
    const client = await this.model
      .findOne({ _id: clientId, workspaceId: new Types.ObjectId(workspaceId), deletedAt: null })
      .exec();
    if (!client) throw ApiException.notFound('Client');
    return client;
  }

  create(
    workspaceId: string,
    userId: string,
    input: Partial<Pick<ClientView, 'contactName' | 'contactEmail' | 'contactPhone' | 'website' | 'notes'>> & { name: string },
  ): Promise<ClientDocument> {
    return this.model.create({
      workspaceId: new Types.ObjectId(workspaceId),
      name: input.name.trim(),
      contactName: input.contactName?.trim() ?? '',
      contactEmail: input.contactEmail?.toLowerCase().trim() ?? '',
      contactPhone: input.contactPhone?.trim() ?? '',
      website: input.website?.trim() ?? '',
      notes: input.notes?.trim() ?? '',
      createdByUserId: new Types.ObjectId(userId),
    });
  }

  async update(
    workspaceId: string,
    clientId: string,
    patch: Partial<Pick<ClientView, 'name' | 'contactName' | 'contactEmail' | 'contactPhone' | 'website' | 'notes' | 'status'>>,
  ): Promise<ClientDocument> {
    const client = await this.getOrThrow(workspaceId, clientId);
    if (patch.name !== undefined) client.name = patch.name.trim();
    if (patch.contactName !== undefined) client.contactName = patch.contactName.trim();
    if (patch.contactEmail !== undefined) client.contactEmail = patch.contactEmail.toLowerCase().trim();
    if (patch.contactPhone !== undefined) client.contactPhone = patch.contactPhone.trim();
    if (patch.website !== undefined) client.website = patch.website.trim();
    if (patch.notes !== undefined) client.notes = patch.notes.trim();
    if (patch.status !== undefined) client.status = patch.status;
    await client.save();
    return client;
  }

  async setProjects(workspaceId: string, clientId: string, projectIds: string[]): Promise<ClientDocument> {
    const client = await this.getOrThrow(workspaceId, clientId);
    client.projectIds = [...new Set(projectIds)].map((id) => new Types.ObjectId(id));
    await client.save();
    return client;
  }

  async softDelete(workspaceId: string, clientId: string): Promise<void> {
    const client = await this.getOrThrow(workspaceId, clientId);
    client.deletedAt = new Date();
    await client.save();
  }

  /** Projects visible to a portal user for the given client. */
  async projectIdsForClient(workspaceId: string, clientId: string): Promise<string[]> {
    const client = await this.model
      .findOne({ _id: clientId, workspaceId: new Types.ObjectId(workspaceId), deletedAt: null })
      .select('projectIds')
      .lean();
    return (client?.projectIds ?? []).map((id) => id.toString());
  }

  toView(c: ClientDocument): ClientView {
    return {
      id: c.id,
      name: c.name,
      logo: c.logo,
      contactName: c.contactName,
      contactEmail: c.contactEmail,
      contactPhone: c.contactPhone,
      website: c.website,
      notes: c.notes,
      status: c.status,
      projectIds: c.projectIds.map((id) => id.toString()),
      createdAt: c.createdAt.toISOString(),
    };
  }
}
