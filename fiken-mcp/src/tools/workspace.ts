/**
 * Tools for the Fiken user and companies, the inbox and received EHF documents, projects and time tracking.
 */

import { FikenWorkspaceService } from 'fiken-shared';
import { z } from 'zod';
import { IdSchema } from '../schemas.js';
import { createdResult, jsonResult, listResult, ToolDefinition, ToolOutput } from './types.js';

// ========== ZOD SCHEMAS ==========

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');
// The time entry filters are date-times; a plain date is accepted too
const DateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/, 'Must be an ISO 8601 date-time');
const TimeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:mm format');

const DetailEnum = z.enum(['summary', 'full']);

const page = z.number().int().min(0).optional();
const pageSize = z.number().int().min(1).max(100).optional();

export const CompanyQueryParamsSchema = z.object({
  page,
  pageSize,
  sortBy: z.enum([
    'createdDate asc', 'createdDate desc', 'name asc', 'name desc', 'organizationNumber asc', 'organizationNumber desc',
  ]).optional(),
}).strict();

export const InboxQueryParamsSchema = z.object({
  page,
  pageSize,
  sortBy: z.enum(['createdDate asc', 'createdDate desc', 'name asc', 'name desc']).optional(),
  status: z.enum(['all', 'unused', 'used']).optional(),
  name: z.string().optional(),
}).strict();

export const EhfStatusEnum = z.enum(['unprocessed', 'used', 'processed', 'deleted']);

export const EhfQueryParamsSchema = z.object({
  page,
  pageSize,
  sortBy: z.enum(['createdDate asc', 'createdDate desc', 'issueDate asc', 'issueDate desc']).optional(),
  status: EhfStatusEnum.optional(),
  issueDate: DateSchema.optional(),
  issueDateLe: DateSchema.optional(),
  issueDateLt: DateSchema.optional(),
  issueDateGe: DateSchema.optional(),
  issueDateGt: DateSchema.optional(),
}).strict();

export const ProjectQueryParamsSchema = z.object({
  page,
  pageSize,
  completed: z.boolean().optional(),
  name: z.string().optional(),
  number: z.string().optional(),
}).strict();

export const ProjectRequestSchema = z.object({
  number: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  startDate: DateSchema,
  endDate: DateSchema.optional(),
  contactId: IdSchema.optional(),
  completed: z.boolean().optional(),
}).strict();

// The project number can't be changed after creation
export const UpdateProjectRequestSchema = ProjectRequestSchema.omit({ number: true }).partial().strict();

export const TimeEntryQueryParamsSchema = z.object({
  page,
  pageSize,
  date: DateSchema.optional(),
  dateGe: DateSchema.optional(),
  dateLe: DateSchema.optional(),
  projectId: IdSchema.optional(),
  activityId: IdSchema.optional(),
  timeUserId: IdSchema.optional(),
  invoiced: z.boolean().optional(),
  lastModifiedGe: DateTimeSchema.optional(),
  lastModifiedLe: DateTimeSchema.optional(),
}).strict();

export const TimeEntryRequestSchema = z.object({
  date: DateSchema,
  hours: z.number().positive(),
  startTime: TimeOfDaySchema.optional(),
  description: z.string().optional(),
  internalNote: z.string().optional(),
  activityId: IdSchema,
  projectId: IdSchema.optional(),
  timeUserId: IdSchema,
}).strict();

// The time user can't be changed after creation
export const UpdateTimeEntryRequestSchema = TimeEntryRequestSchema.omit({ timeUserId: true }).partial().strict();

export const TimeEntryInvoiceDraftRequestSchema = z.object({
  timeEntryIds: z.array(IdSchema).min(1, 'At least one time entry is required'),
  customerId: IdSchema,
  daysUntilDueDate: z.number().int().min(0),
  groupBy: z.enum(['activity', 'activityAndPerson', 'none']).optional(),
  includeTimeEntryDescriptions: z.boolean().optional(),
  issueDate: DateSchema.optional(),
  projectId: IdSchema.optional(),
  invoiceText: z.string().optional(),
  yourReference: z.string().optional(),
  ourReference: z.string().optional(),
  orderReference: z.string().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code, e.g. NOK').optional(),
  bankAccountNumber: z.string().optional(),
}).strict();

export const ActivityQueryParamsSchema = z.object({
  page,
  pageSize,
  name: z.string().optional(),
  archived: z.boolean().optional(),
}).strict();

export const ActivityRequestSchema = z.object({
  name: z.string().min(1),
  hourlyRate: z.number().int().min(0).optional(),
  productId: IdSchema.optional(),
  billable: z.boolean().optional(),
  description: z.string().optional(),
  projectId: IdSchema.optional(),
}).strict();

export const UpdateActivityRequestSchema = ActivityRequestSchema.partial().strict();

export const TimeUserQueryParamsSchema = z.object({
  page,
  pageSize,
  name: z.string().optional(),
  email: z.string().optional(),
}).strict();

// PATCH with nothing to change is a no-op the agent almost certainly didn't intend
const nonEmpty = <T extends z.ZodTypeAny>(schema: T) =>
  schema.refine(value => Object.keys(value ?? {}).length > 0, 'Provide at least one field to update');

// ========== JSON SCHEMA FRAGMENTS ==========

const companySlug = {
  type: 'string',
  description: 'Company identifier slug (defaults to env FIKEN_COMPANY_SLUG if omitted)',
};
const date = (description: string) => ({ type: 'string', format: 'date', description: `${description} (YYYY-MM-DD)` });
const detail = {
  type: 'string',
  enum: DetailEnum.options,
  description: 'summary (default): compact fields per item; full: complete Fiken records (much larger)',
};
const pagination = {
  page: { type: 'integer', minimum: 0, description: 'Page number (0-based, default 0)' },
  pageSize: { type: 'integer', minimum: 1, maximum: 100, description: 'Items per page (1-100, default 25)' },
};
const id = (description: string) => ({ type: 'integer', minimum: 1, description });

const listInput = (params: Record<string, unknown>, extra: Record<string, unknown> = { companySlug }) => ({
  type: 'object' as const,
  properties: {
    ...extra,
    detail,
    params: { type: 'object', properties: { ...pagination, ...params }, additionalProperties: false },
  },
  required: [],
});

const getInput = (idName: string, description: string) => ({
  type: 'object' as const,
  properties: { companySlug, [idName]: id(description) },
  required: [idName],
});

const projectProperties = {
  name: { type: 'string', description: 'Project name' },
  description: { type: 'string' },
  startDate: date('Start date, inclusive'),
  endDate: date('End date, inclusive'),
  contactId: id('Customer contact for the project; use fiken_get_contacts to find it'),
  completed: { type: 'boolean', description: 'Whether the project is completed' },
};

const timeEntryProperties = {
  date: date('Date the work was done'),
  hours: { type: 'number', exclusiveMinimum: 0, description: 'Hours worked, e.g. 7.5' },
  startTime: { type: 'string', description: 'Start time of the work (HH:mm)' },
  description: { type: 'string', description: 'Description of the work; shown on invoices' },
  internalNote: { type: 'string', description: 'Internal note; not shown on invoices' },
  activityId: id('Activity; use fiken_get_activities to find it'),
  projectId: id('Project; use fiken_get_projects to find it'),
};

const activityProperties = {
  name: { type: 'string', description: 'Activity name, unique within the company' },
  hourlyRate: { type: 'integer', minimum: 0, description: 'Default hourly rate in cents (øre): 125000 = 1250.00' },
  productId: id('Product used when invoicing this activity'),
  billable: { type: 'boolean', description: 'Whether time on this activity is billable by default' },
  description: { type: 'string' },
  projectId: id('Project the activity belongs to'),
};

// ========== SUMMARIES ==========

export const toCompanySummary = (company: any) => ({
  slug: company.slug,
  name: company.name,
  organizationNumber: company.organizationNumber,
  testCompany: company.testCompany,
  hasApiAccess: company.hasApiAccess,
});

export const toInboxDocumentSummary = (doc: any) => ({
  documentId: doc.documentId,
  name: doc.name,
  filename: doc.filename,
  used: doc.status,
  createdAt: doc.createdAt,
});

export const toEhfDocumentSummary = (doc: any) => ({
  ehfDocumentId: doc.ehfDocumentId,
  status: doc.status,
  documentType: doc.documentType,
  invoiceNumber: doc.invoiceNumber,
  issueDate: doc.issueDate,
  dueDate: doc.dueDate,
  supplierName: doc.supplierName,
  supplierContactId: doc.supplierContactId,
  currency: doc.currency,
  gross: doc.gross,
  purchaseId: doc.purchaseId,
});

export const toProjectSummary = (project: any) => ({
  projectId: project.projectId,
  number: project.number,
  name: project.name,
  startDate: project.startDate,
  endDate: project.endDate,
  contactId: project.contact?.contactId,
  contact: project.contact?.name,
  completed: project.completed,
});

export const toTimeEntrySummary = (entry: any) => ({
  timeEntryId: entry.timeEntryId,
  date: entry.date,
  hours: entry.hours,
  description: entry.description,
  activityId: entry.activity?.activityId,
  activity: entry.activity?.name,
  projectId: entry.project?.projectId,
  project: entry.project?.name,
  timeUserId: entry.timeUser?.timeUserId,
  timeUser: entry.timeUser?.name,
  invoiced: entry.invoiced,
});

export const toActivitySummary = (activity: any) => ({
  activityId: activity.activityId,
  name: activity.name,
  hourlyRate: activity.hourlyRate,
  billable: activity.billable,
  projectId: activity.project?.projectId,
  archived: activity.archived,
});

export const toTimeUserSummary = (user: any) => ({
  timeUserId: user.timeUserId,
  name: user.name,
  email: user.email,
});

// Fiken's PATCH endpoints answer with an empty body and a Location header, or sometimes the updated resource
const updatedResult = (message: string, response: { data: unknown; location?: string }): ToolOutput =>
  response.data && typeof response.data === 'object' ? jsonResult(response.data) : createdResult(message, response);

const parseList = <T extends z.ZodTypeAny>(paramsSchema: T, args: Record<string, any>) => ({
  detail: DetailEnum.default('summary').parse(args.detail, { path: ['detail'] }),
  params: paramsSchema.optional().parse(args.params, { path: ['params'] }) as z.infer<T> | undefined,
});

// ========== TOOLS ==========

export const companyTools: ToolDefinition[] = [
  {
    name: 'fiken_get_user',
    description: 'Get the Fiken user the API token belongs to (name and email).',
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async (_args, context) => {
      const response = await context.client(FikenWorkspaceService).getUser();
      return jsonResult(response.data);
    },
  },
  {
    name: 'fiken_get_companies',
    description: 'List the companies the user can access, with each company\'s slug. Use it to find the companySlug ' +
      'that every other tool takes.',
    inputSchema: listInput({
      sortBy: {
        type: 'string',
        enum: CompanyQueryParamsSchema.shape.sortBy.unwrap().options,
        description: 'Sort order (default name asc)',
      },
    }, {}),
    handler: async (args, context) => {
      const { detail, params } = parseList(CompanyQueryParamsSchema, args);
      const response = await context.client(FikenWorkspaceService).getCompanies(params);
      return listResult('companies', response, detail === 'full' ? undefined : toCompanySummary);
    },
  },
  {
    name: 'fiken_get_company',
    description: 'Get a company\'s details: name, organization number, VAT registration, address and accounting start date.',
    inputSchema: { type: 'object', properties: { companySlug }, required: [] },
    handler: async (args, context) => {
      const slug = context.resolveCompanySlug(args.companySlug);
      const response = await context.client(FikenWorkspaceService).getCompany(slug);
      return jsonResult(response.data);
    },
  },
];

export const inboxTools: ToolDefinition[] = [
  {
    name: 'fiken_get_inbox_documents',
    description: 'List documents in the company\'s inbox (uploaded receipts and invoices). ' +
      'Returns documentId, name, filename, used and createdAt per document; documentId is the inboxDocumentId that ' +
      'attachment tools accept.',
    inputSchema: listInput({
      sortBy: {
        type: 'string',
        enum: InboxQueryParamsSchema.shape.sortBy.unwrap().options,
        description: 'Sort order (default createdDate desc)',
      },
      status: {
        type: 'string',
        enum: InboxQueryParamsSchema.shape.status.unwrap().options,
        description: 'unused: not yet used as documentation; used: already used (default all)',
      },
      name: { type: 'string', description: 'Case-insensitive substring match on the document name' },
    }),
    handler: async (args, context) => {
      const slug = context.resolveCompanySlug(args.companySlug);
      const { detail, params } = parseList(InboxQueryParamsSchema, args);
      const response = await context.client(FikenWorkspaceService).getInboxDocuments(slug, params);
      return listResult('documents', response, detail === 'full' ? undefined : toInboxDocumentSummary);
    },
  },
  {
    name: 'fiken_get_inbox_document',
    description: 'Get one inbox document, including its download URL.',
    inputSchema: getInput('inboxDocumentId', 'Inbox document ID (documentId from fiken_get_inbox_documents)'),
    handler: async (args, context) => {
      const slug = context.resolveCompanySlug(args.companySlug);
      const inboxDocumentId = IdSchema.parse(args.inboxDocumentId, { path: ['inboxDocumentId'] });
      const response = await context.client(FikenWorkspaceService).getInboxDocument(slug, inboxDocumentId);
      return jsonResult(response.data);
    },
  },
  {
    name: 'fiken_get_ehf_documents',
    description: 'List received EHF documents (electronic supplier invoices and credit notes). Returns a summary with ' +
      'supplier, invoice number, dates, gross amount in cents (øre) and status; unprocessed ones still need booking.',
    inputSchema: listInput({
      sortBy: {
        type: 'string',
        enum: EhfQueryParamsSchema.shape.sortBy.unwrap().options,
        description: 'Sort order (default createdDate desc)',
      },
      status: {
        type: 'string',
        enum: EhfStatusEnum.options,
        description: 'unprocessed: still in the inbox; used: attached as documentation; processed: booked as a ' +
          'purchase; deleted: removed (default all but deleted)',
      },
      issueDate: date('Issue date equals'),
      issueDateLe: date('Issue date on or before'),
      issueDateLt: date('Issue date before'),
      issueDateGe: date('Issue date on or after'),
      issueDateGt: date('Issue date after'),
    }),
    handler: async (args, context) => {
      const slug = context.resolveCompanySlug(args.companySlug);
      const { detail, params } = parseList(EhfQueryParamsSchema, args);
      const response = await context.client(FikenWorkspaceService).getEhfDocuments(slug, params);
      return listResult('ehfDocuments', response, detail === 'full' ? undefined : toEhfDocumentSummary);
    },
  },
  {
    name: 'fiken_get_ehf_document',
    description: 'Get one received EHF document with its lines, payment details (KID, account number) and PDF/XML ' +
      'URLs. Amounts are integer cents (øre).',
    inputSchema: getInput('ehfDocumentId', 'EHF document ID'),
    handler: async (args, context) => {
      const slug = context.resolveCompanySlug(args.companySlug);
      const ehfDocumentId = IdSchema.parse(args.ehfDocumentId, { path: ['ehfDocumentId'] });
      const response = await context.client(FikenWorkspaceService).getEhfDocument(slug, ehfDocumentId);
      return jsonResult(response.data);
    },
  },
];

export const projectTools: ToolDefinition[] = [
  {
    name: 'fiken_get_projects',
    description: 'List projects. Returns projectId, number, name, dates, customer and completed per project.',
    inputSchema: listInput({
      completed: { type: 'boolean', description: 'Only completed (true) or ongoing (false) projects' },
      name: { type: 'string', description: 'Filter by project name' },
      number: { type: 'string', description: 'Filter by project number' },
    }),
    handler: async (args, context) => {
      const slug = context.resolveCompanySlug(args.companySlug);
      const { detail, params } = parseList(ProjectQueryParamsSchema, args);
      const response = await context.client(FikenWorkspaceService).getProjects(slug, params);
      return listResult('projects', response, detail === 'full' ? undefined : toProjectSummary);
    },
  },
  {
    name: 'fiken_get_project',
    description: 'Get one project, including its customer contact.',
    inputSchema: getInput('projectId', 'Project ID'),
    handler: async (args, context) => {
      const slug = context.resolveCompanySlug(args.companySlug);
      const projectId = IdSchema.parse(args.projectId, { path: ['projectId'] });
      const response = await context.client(FikenWorkspaceService).getProject(slug, projectId);
      return jsonResult(response.data);
    },
  },
  {
    name: 'fiken_create_project',
    description: 'Create a project. Returns the new projectId.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        project: {
          type: 'object',
          properties: {
            number: { type: 'string', description: 'Project number; can\'t be changed later' },
            ...projectProperties,
          },
          required: ['number', 'name', 'startDate'],
          additionalProperties: false,
        },
      },
      required: ['project'],
    },
    handler: async (args, context) => {
      const slug = context.resolveCompanySlug(args.companySlug);
      const project = ProjectRequestSchema.parse(args.project, { path: ['project'] });
      const response = await context.client(FikenWorkspaceService).createProject(slug, project);
      return createdResult('Project created', response);
    },
  },
  {
    name: 'fiken_update_project',
    description: 'Update a project\'s name, description, dates, customer or completed flag; only the given fields change.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        projectId: id('Project ID'),
        updates: { type: 'object', properties: projectProperties, additionalProperties: false },
      },
      required: ['projectId', 'updates'],
    },
    handler: async (args, context) => {
      const slug = context.resolveCompanySlug(args.companySlug);
      const projectId = IdSchema.parse(args.projectId, { path: ['projectId'] });
      const updates = nonEmpty(UpdateProjectRequestSchema).parse(args.updates, { path: ['updates'] });
      const response = await context.client(FikenWorkspaceService).updateProject(slug, projectId, updates);
      return updatedResult('Project updated', response);
    },
  },
];

export const timeTools: ToolDefinition[] = [
  {
    name: 'fiken_get_time_entries',
    description: 'List time entries (hours registered). Returns date, hours, description, activity, project, person ' +
      'and invoiced per entry.',
    inputSchema: listInput({
      date: date('Date equals'),
      dateGe: date('Date on or after'),
      dateLe: date('Date on or before'),
      projectId: id('Only entries on this project'),
      activityId: id('Only entries on this activity'),
      timeUserId: id('Only entries by this person'),
      invoiced: { type: 'boolean', description: 'Only invoiced (true) or not yet invoiced (false) entries' },
      lastModifiedGe: { type: 'string', format: 'date-time', description: 'Modified at or after (ISO 8601 date-time)' },
      lastModifiedLe: { type: 'string', format: 'date-time', description: 'Modified at or before (ISO 8601 date-time)' },
    }),
    handler: async (args, context) => {
      const slug = context.resolveCompanySlug(args.companySlug);
      const { detail, params } = parseList(TimeEntryQueryParamsSchema, args);
      const response = await context.client(FikenWorkspaceService).getTimeEntries(slug, params);
      return listResult('timeEntries', response, detail === 'full' ? undefined : toTimeEntrySummary);
    },
  },
  {
    name: 'fiken_get_time_entry',
    description: 'Get one time entry, including its activity, project, person and invoice status.',
    inputSchema: getInput('timeEntryId', 'Time entry ID'),
    handler: async (args, context) => {
      const slug = context.resolveCompanySlug(args.companySlug);
      const timeEntryId = IdSchema.parse(args.timeEntryId, { path: ['timeEntryId'] });
      const response = await context.client(FikenWorkspaceService).getTimeEntry(slug, timeEntryId);
      return jsonResult(response.data);
    },
  },
  {
    name: 'fiken_create_time_entry',
    description: 'Register hours worked. Returns the new timeEntryId. Use fiken_get_time_users for timeUserId and ' +
      'fiken_get_activities for activityId.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        timeEntry: {
          type: 'object',
          properties: {
            ...timeEntryProperties,
            timeUserId: id('Person who did the work; use fiken_get_time_users to find it'),
          },
          required: ['date', 'hours', 'activityId', 'timeUserId'],
          additionalProperties: false,
        },
      },
      required: ['timeEntry'],
    },
    handler: async (args, context) => {
      const slug = context.resolveCompanySlug(args.companySlug);
      const timeEntry = TimeEntryRequestSchema.parse(args.timeEntry, { path: ['timeEntry'] });
      const response = await context.client(FikenWorkspaceService).createTimeEntry(slug, timeEntry);
      return createdResult('Time entry created', response);
    },
  },
  {
    name: 'fiken_update_time_entry',
    description: 'Update a time entry; only the given fields change. Invoiced or locked entries can\'t be changed.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        timeEntryId: id('Time entry ID'),
        updates: { type: 'object', properties: timeEntryProperties, additionalProperties: false },
      },
      required: ['timeEntryId', 'updates'],
    },
    handler: async (args, context) => {
      const slug = context.resolveCompanySlug(args.companySlug);
      const timeEntryId = IdSchema.parse(args.timeEntryId, { path: ['timeEntryId'] });
      const updates = nonEmpty(UpdateTimeEntryRequestSchema).parse(args.updates, { path: ['updates'] });
      const response = await context.client(FikenWorkspaceService).updateTimeEntry(slug, timeEntryId, updates);
      return updatedResult('Time entry updated', response);
    },
  },
  {
    name: 'fiken_create_invoice_draft_from_time_entries',
    description: 'Create an invoice draft from uninvoiced time entries, one line per activity by default. Returns the ' +
      'new invoice draft\'s id; the draft still has to be turned into an invoice.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        request: {
          type: 'object',
          properties: {
            timeEntryIds: {
              type: 'array',
              minItems: 1,
              items: { type: 'integer', minimum: 1 },
              description: 'Time entries to invoice; none may be invoiced or in another draft already',
            },
            customerId: id('Customer contact to invoice (customer=true); use fiken_get_contacts to find it'),
            daysUntilDueDate: { type: 'integer', minimum: 0, description: 'Days until the invoice is due' },
            groupBy: {
              type: 'string',
              enum: TimeEntryInvoiceDraftRequestSchema.shape.groupBy.unwrap().options,
              description: 'activity (default): a line per activity; activityAndPerson: per activity and person; ' +
                'none: a line per time entry',
            },
            includeTimeEntryDescriptions: {
              type: 'boolean',
              description: 'Append each time entry\'s description to the line text (default false)',
            },
            issueDate: date('Issue date, defaults to today'),
            projectId: id('Project for the draft; defaults to the entries\' project if they share one'),
            invoiceText: { type: 'string', description: 'Text shown above the invoice lines' },
            yourReference: { type: 'string', description: 'Customer\'s reference person' },
            ourReference: { type: 'string', description: 'Your reference person' },
            orderReference: { type: 'string', description: 'Order reference (used for EHF invoices)' },
            currency: { type: 'string', pattern: '^[A-Z]{3}$', description: 'ISO 4217 currency code (default NOK)' },
            bankAccountNumber: { type: 'string', description: 'Bank account number for payment' },
          },
          required: ['timeEntryIds', 'customerId', 'daysUntilDueDate'],
          additionalProperties: false,
        },
      },
      required: ['request'],
    },
    handler: async (args, context) => {
      const slug = context.resolveCompanySlug(args.companySlug);
      const request = TimeEntryInvoiceDraftRequestSchema.parse(args.request, { path: ['request'] });
      const response = await context.client(FikenWorkspaceService).createInvoiceDraftFromTimeEntries(slug, request);
      return createdResult('Invoice draft created from time entries', response);
    },
  },
  {
    name: 'fiken_get_activities',
    description: 'List activities (types of work that time is registered on). Returns activityId, name, hourly rate ' +
      'in cents (øre), billable, projectId and archived per activity.',
    inputSchema: listInput({
      name: { type: 'string', description: 'Partial match on the activity name' },
      archived: { type: 'boolean', description: 'Only archived (true) or active (false) activities (default all)' },
    }),
    handler: async (args, context) => {
      const slug = context.resolveCompanySlug(args.companySlug);
      const { detail, params } = parseList(ActivityQueryParamsSchema, args);
      const response = await context.client(FikenWorkspaceService).getActivities(slug, params);
      return listResult('activities', response, detail === 'full' ? undefined : toActivitySummary);
    },
  },
  {
    name: 'fiken_get_activity',
    description: 'Get one activity, including its product and project. hourlyRate is integer cents (øre).',
    inputSchema: getInput('activityId', 'Activity ID'),
    handler: async (args, context) => {
      const slug = context.resolveCompanySlug(args.companySlug);
      const activityId = IdSchema.parse(args.activityId, { path: ['activityId'] });
      const response = await context.client(FikenWorkspaceService).getActivity(slug, activityId);
      return jsonResult(response.data);
    },
  },
  {
    name: 'fiken_create_activity',
    description: 'Create an activity to register time on. Returns the new activityId.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        activity: { type: 'object', properties: activityProperties, required: ['name'], additionalProperties: false },
      },
      required: ['activity'],
    },
    handler: async (args, context) => {
      const slug = context.resolveCompanySlug(args.companySlug);
      const activity = ActivityRequestSchema.parse(args.activity, { path: ['activity'] });
      const response = await context.client(FikenWorkspaceService).createActivity(slug, activity);
      return createdResult('Activity created', response);
    },
  },
  {
    name: 'fiken_update_activity',
    description: 'Update an activity; only the given fields change. hourlyRate is integer cents (øre).',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        activityId: id('Activity ID'),
        updates: { type: 'object', properties: activityProperties, additionalProperties: false },
      },
      required: ['activityId', 'updates'],
    },
    handler: async (args, context) => {
      const slug = context.resolveCompanySlug(args.companySlug);
      const activityId = IdSchema.parse(args.activityId, { path: ['activityId'] });
      const updates = nonEmpty(UpdateActivityRequestSchema).parse(args.updates, { path: ['updates'] });
      const response = await context.client(FikenWorkspaceService).updateActivity(slug, activityId, updates);
      return updatedResult('Activity updated', response);
    },
  },
  {
    name: 'fiken_get_time_users',
    description: 'List the people who can register time. Returns timeUserId, name and email per person.',
    inputSchema: listInput({
      name: { type: 'string', description: 'Partial match on the name' },
      email: { type: 'string', description: 'Filter by email address' },
    }),
    handler: async (args, context) => {
      const slug = context.resolveCompanySlug(args.companySlug);
      const { detail, params } = parseList(TimeUserQueryParamsSchema, args);
      const response = await context.client(FikenWorkspaceService).getTimeUsers(slug, params);
      return listResult('timeUsers', response, detail === 'full' ? undefined : toTimeUserSummary);
    },
  },
  {
    name: 'fiken_get_time_user',
    description: 'Get one person who can register time.',
    inputSchema: getInput('timeUserId', 'Time user ID'),
    handler: async (args, context) => {
      const slug = context.resolveCompanySlug(args.companySlug);
      const timeUserId = IdSchema.parse(args.timeUserId, { path: ['timeUserId'] });
      const response = await context.client(FikenWorkspaceService).getTimeUser(slug, timeUserId);
      return jsonResult(response.data);
    },
  },
];
