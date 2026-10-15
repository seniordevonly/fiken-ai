import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { FikenContext } from '../context.js';
import { IdSchema } from '../schemas.js';
import { ToolRegistry } from './registry.js';
import {
  ActivityQueryParamsSchema,
  ActivityRequestSchema,
  CompanyQueryParamsSchema,
  companyTools,
  EhfQueryParamsSchema,
  InboxQueryParamsSchema,
  inboxTools,
  ProjectQueryParamsSchema,
  ProjectRequestSchema,
  projectTools,
  TimeEntryInvoiceDraftRequestSchema,
  TimeEntryQueryParamsSchema,
  TimeEntryRequestSchema,
  timeTools,
  TimeUserQueryParamsSchema,
  UpdateActivityRequestSchema,
  UpdateProjectRequestSchema,
  UpdateTimeEntryRequestSchema,
} from './workspace.js';

const BASE = 'https://api.fiken.no/api/v2/companies/co';

const pageHeaders = {
  'Fiken-Api-Page': 0,
  'Fiken-Api-Page-Size': 25,
  'Fiken-Api-Page-Count': 1,
  'Fiken-Api-Result-Count': 1,
};

const fullTimeEntry = {
  timeEntryId: 11,
  date: '2026-03-15',
  hours: 7.5,
  startTime: '09:00',
  endTime: '16:30',
  description: 'Built the thing',
  internalNote: 'secret',
  activity: { activityId: 3, name: 'Development', hourlyRate: 125000, product: { productId: 1 } },
  project: { projectId: 4, name: 'Website', contact: { contactId: 9, name: 'Acme AS' } },
  timeUser: { timeUserId: 5, name: 'Ola Nordmann', email: 'ola@example.com' },
  invoiced: false,
  locked: false,
};

const allTools = [...companyTools, ...inboxTools, ...projectTools, ...timeTools];

const setup = (overrides: Record<string, unknown> = {}) => {
  const service = {
    getUser: vi.fn().mockResolvedValue({ data: { name: 'Test', email: 'test@fiken.no' } }),
    getCompanies: vi.fn().mockResolvedValue({
      data: [{ name: 'Co AS', slug: 'co', organizationNumber: '123456789', testCompany: false, hasApiAccess: true,
        address: { country: 'Norway' }, vatType: 'monthly' }],
      headers: pageHeaders,
    }),
    getCompany: vi.fn().mockResolvedValue({ data: { name: 'Co AS', slug: 'co' } }),
    getEhfDocuments: vi.fn().mockResolvedValue({
      data: [{ ehfDocumentId: 7, status: 'unprocessed', supplierName: 'Supplier AS', gross: 12500, lines: [{ net: 10000 }] }],
      headers: pageHeaders,
    }),
    getTimeEntries: vi.fn().mockResolvedValue({ data: [fullTimeEntry], headers: pageHeaders }),
    getTimeEntry: vi.fn().mockResolvedValue({ data: fullTimeEntry }),
    getProject: vi.fn().mockResolvedValue({ data: { projectId: 4, name: 'Website' } }),
    createProject: vi.fn().mockResolvedValue({ data: undefined, location: `${BASE}/projects/42` }),
    updateProject: vi.fn().mockResolvedValue({ data: undefined, location: `${BASE}/projects/42` }),
    createTimeEntry: vi.fn().mockResolvedValue({ data: undefined, location: `${BASE}/timeEntries/77` }),
    updateActivity: vi.fn().mockResolvedValue({ data: { activityId: 3, name: 'Dev' } }),
    createInvoiceDraftFromTimeEntries: vi.fn().mockResolvedValue({ data: undefined, location: `${BASE}/invoices/drafts/88` }),
    ...overrides,
  };
  const context = {
    resolveCompanySlug: (s?: string) => s ?? 'co',
    client: () => service,
  } as unknown as FikenContext;
  const registry = new ToolRegistry(allTools, context);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await registry.call(name, args, 'stdio');
    return { ...result, text: result.content[0].text, json: () => JSON.parse(result.content[0].text) };
  };
  return { service, call };
};

describe('workspace tools', () => {
  it('names every tool uniquely with the fiken_ prefix and has no delete or send tools', () => {
    const names = allTools.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^fiken_[a-z_]+$/);
      expect(name).not.toMatch(/delete|send/);
    }
    expect(companyTools.map(t => t.name)).toEqual(['fiken_get_user', 'fiken_get_companies', 'fiken_get_company']);
  });

  it('fiken_get_user takes no company slug', async () => {
    const { service, call } = setup();
    expect(companyTools[0].inputSchema.properties).toEqual({});

    const result = await call('fiken_get_user');

    expect(service.getUser).toHaveBeenCalledWith();
    expect(result.json()).toEqual({ name: 'Test', email: 'test@fiken.no' });
  });

  it('fiken_get_companies returns compact summaries with the slug and pagination', async () => {
    const { service, call } = setup();

    const result = await call('fiken_get_companies', { params: { sortBy: 'name desc' } });

    expect(service.getCompanies).toHaveBeenCalledWith({ sortBy: 'name desc' });
    expect(result.json()).toEqual({
      pagination: { page: 0, pageSize: 25, pageCount: 1, resultCount: 1 },
      companies: [{ slug: 'co', name: 'Co AS', organizationNumber: '123456789', testCompany: false, hasApiAccess: true }],
    });
  });

  it('fiken_get_company resolves the default company slug', async () => {
    const { service, call } = setup();
    await call('fiken_get_company');
    expect(service.getCompany).toHaveBeenCalledWith('co');
  });

  it('fiken_get_time_entries summarises entries and passes filters', async () => {
    const { service, call } = setup();

    const result = await call('fiken_get_time_entries', {
      companySlug: 'other',
      params: { dateGe: '2026-03-01', invoiced: false, projectId: 4 },
    });

    expect(service.getTimeEntries).toHaveBeenCalledWith('other', { dateGe: '2026-03-01', invoiced: false, projectId: 4 });
    expect(result.json().timeEntries).toEqual([{
      timeEntryId: 11,
      date: '2026-03-15',
      hours: 7.5,
      description: 'Built the thing',
      activityId: 3,
      activity: 'Development',
      projectId: 4,
      project: 'Website',
      timeUserId: 5,
      timeUser: 'Ola Nordmann',
      invoiced: false,
    }]);
  });

  it('detail="full" returns complete records', async () => {
    const { call } = setup();
    const result = await call('fiken_get_ehf_documents', { detail: 'full', params: { status: 'unprocessed' } });
    expect(result.json().ehfDocuments[0].lines).toEqual([{ net: 10000 }]);
  });

  it('fiken_get_time_entry returns the full record', async () => {
    const { service, call } = setup();
    const result = await call('fiken_get_time_entry', { timeEntryId: 11 });
    expect(service.getTimeEntry).toHaveBeenCalledWith('co', 11);
    expect(result.json()).toEqual(fullTimeEntry);
  });

  it('fiken_create_project returns the new id', async () => {
    const { service, call } = setup();
    const project = { number: 'P1', name: 'Website', startDate: '2026-01-01', contactId: 9 };

    const result = await call('fiken_create_project', { project });

    expect(service.createProject).toHaveBeenCalledWith('co', project);
    expect(result.json()).toEqual({ message: 'Project created', id: 42, location: `${BASE}/projects/42` });
  });

  it('fiken_create_time_entry returns the new id', async () => {
    const { call } = setup();
    const result = await call('fiken_create_time_entry', {
      timeEntry: { date: '2026-03-15', hours: 7.5, activityId: 3, timeUserId: 5 },
    });
    expect(result.json().id).toBe(77);
  });

  it('fiken_create_invoice_draft_from_time_entries returns the draft id', async () => {
    const { service, call } = setup();
    const request = { timeEntryIds: [11, 12], customerId: 9, daysUntilDueDate: 14, groupBy: 'none' };

    const result = await call('fiken_create_invoice_draft_from_time_entries', { request });

    expect(service.createInvoiceDraftFromTimeEntries).toHaveBeenCalledWith('co', request);
    expect(result.json().id).toBe(88);
  });

  it('updates return the resource when Fiken sends it, otherwise the location', async () => {
    const { service, call } = setup();

    const activity = await call('fiken_update_activity', { activityId: 3, updates: { name: 'Dev' } });
    expect(activity.json()).toEqual({ activityId: 3, name: 'Dev' });

    const project = await call('fiken_update_project', { projectId: 42, updates: { completed: true } });
    expect(service.updateProject).toHaveBeenCalledWith('co', 42, { completed: true });
    expect(project.json()).toMatchObject({ message: 'Project updated', id: 42 });
  });

  describe('validation errors name the field', () => {
    it.each([
      ['fiken_get_time_entry', { timeEntryId: 0 }, 'timeEntryId'],
      ['fiken_get_companies', { params: { pageSize: 500 } }, 'params.pageSize'],
      ['fiken_get_projects', { detail: 'everything' }, 'detail'],
      ['fiken_create_project', { project: { number: 'P1', name: 'X', startDate: '01.01.2026' } }, 'project.startDate'],
      ['fiken_create_time_entry', { timeEntry: { date: '2026-03-15', hours: 1, activityId: 3 } }, 'timeEntry.timeUserId'],
      ['fiken_create_time_entry', {
        timeEntry: { date: '2026-03-15', hours: 1, activityId: 3, timeUserId: 5, startTime: '9am' },
      }, 'timeEntry.startTime'],
      ['fiken_create_invoice_draft_from_time_entries', {
        request: { timeEntryIds: [], customerId: 9, daysUntilDueDate: 14 },
      }, 'request.timeEntryIds'],
      ['fiken_update_time_entry', { timeEntryId: 11, updates: { timeUserId: 5 } }, 'updates'],
    ])('%s %j', async (name, args, field) => {
      const { call } = setup();
      const result = await call(name, args);
      expect(result.isError).toBe(true);
      expect(result.text).toContain(`Invalid arguments: ${field}`);
    });

    it('rejects an empty update', async () => {
      const { service, call } = setup();
      const result = await call('fiken_update_project', { projectId: 42, updates: {} });
      expect(result.text).toBe('Error: Invalid arguments: updates: Provide at least one field to update');
      expect(service.updateProject).not.toHaveBeenCalled();
    });
  });

  describe('input schemas advertise every zod field', () => {
    const unwrap = (schema: z.ZodTypeAny): z.ZodTypeAny => {
      if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) return unwrap(schema._def.innerType);
      if (schema instanceof z.ZodEffects) return unwrap(schema._def.schema);
      return schema;
    };
    const isOptional = (schema: z.ZodTypeAny) => schema.isOptional() || schema instanceof z.ZodDefault;

    // Walks a zod schema alongside its JSON schema, collecting every mismatch in field names or required-ness
    const diff = (zodSchema: z.ZodTypeAny, json: any, path: string): string[] => {
      const inner = unwrap(zodSchema);
      if (inner instanceof z.ZodArray) return diff(inner.element, json.items, `${path}[]`);
      if (!(inner instanceof z.ZodObject)) return [];

      const shape = inner.shape as Record<string, z.ZodTypeAny>;
      const zodKeys = Object.keys(shape).sort();
      const jsonKeys = Object.keys(json.properties ?? {}).sort();
      const zodRequired = zodKeys.filter(key => !isOptional(shape[key]));
      const problems: string[] = [];
      if (zodKeys.join() !== jsonKeys.join()) problems.push(`${path} properties: zod [${zodKeys}] vs json [${jsonKeys}]`);
      if (zodRequired.join() !== [...(json.required ?? [])].sort().join()) {
        problems.push(`${path} required: zod [${zodRequired}] vs json [${json.required ?? []}]`);
      }
      for (const key of zodKeys) {
        if (json.properties?.[key]) problems.push(...diff(shape[key], json.properties[key], `${path}.${key}`));
      }
      return problems;
    };

    // What each handler parses, as one object per tool
    const slug = z.string().optional();
    const detail = z.enum(['summary', 'full']).optional();
    const list = (params: z.ZodTypeAny) => z.object({ companySlug: slug, detail, params: params.optional() });
    const byId = (key: string) => z.object({ companySlug: slug, [key]: IdSchema });
    const argSchemas: Record<string, z.ZodTypeAny> = {
      fiken_get_user: z.object({}),
      fiken_get_companies: z.object({ detail, params: CompanyQueryParamsSchema.optional() }),
      fiken_get_company: z.object({ companySlug: slug }),
      fiken_get_inbox_documents: list(InboxQueryParamsSchema),
      fiken_get_inbox_document: byId('inboxDocumentId'),
      fiken_get_ehf_documents: list(EhfQueryParamsSchema),
      fiken_get_ehf_document: byId('ehfDocumentId'),
      fiken_get_projects: list(ProjectQueryParamsSchema),
      fiken_get_project: byId('projectId'),
      fiken_create_project: z.object({ companySlug: slug, project: ProjectRequestSchema }),
      fiken_update_project: z.object({ companySlug: slug, projectId: IdSchema, updates: UpdateProjectRequestSchema }),
      fiken_get_time_entries: list(TimeEntryQueryParamsSchema),
      fiken_get_time_entry: byId('timeEntryId'),
      fiken_create_time_entry: z.object({ companySlug: slug, timeEntry: TimeEntryRequestSchema }),
      fiken_update_time_entry: z.object({ companySlug: slug, timeEntryId: IdSchema, updates: UpdateTimeEntryRequestSchema }),
      fiken_create_invoice_draft_from_time_entries: z.object({ companySlug: slug, request: TimeEntryInvoiceDraftRequestSchema }),
      fiken_get_activities: list(ActivityQueryParamsSchema),
      fiken_get_activity: byId('activityId'),
      fiken_create_activity: z.object({ companySlug: slug, activity: ActivityRequestSchema }),
      fiken_update_activity: z.object({ companySlug: slug, activityId: IdSchema, updates: UpdateActivityRequestSchema }),
      fiken_get_time_users: list(TimeUserQueryParamsSchema),
      fiken_get_time_user: byId('timeUserId'),
    };

    it('covers every tool', () => {
      expect(Object.keys(argSchemas).sort()).toEqual(allTools.map(t => t.name).sort());
    });

    it.each(allTools.map(t => [t.name, t] as const))('%s', (name, tool) => {
      expect(diff(argSchemas[name], tool.inputSchema, name)).toEqual([]);
    });

    it('every tool has a description and object input schema', () => {
      for (const t of allTools) {
        expect(t.description.length).toBeGreaterThan(20);
        expect(t.inputSchema.type).toBe('object');
      }
    });
  });
});
