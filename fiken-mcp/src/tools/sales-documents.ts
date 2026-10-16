/**
 * Tools for credit notes, offers, order confirmations (with their drafts and number counters), and read-only
 * access to recurring invoices.
 */

import { FikenSalesDocumentService } from 'fiken-shared';
import { z } from 'zod';
import type { FikenContext } from '../context.js';
import { IdSchema } from '../schemas.js';
import { createdResult, jsonResult, listResult, textResult, type ToolDefinition } from './types.js';

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');
const CurrencySchema = z.string().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code');
const DetailSchema = z.enum(['summary', 'full']).default('summary');
const PageSchema = {
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
};
const dateFilters = <K extends string>(field: K) => ({
  [field]: DateSchema.optional(),
  [`${field}Le`]: DateSchema.optional(),
  [`${field}Lt`]: DateSchema.optional(),
  [`${field}Ge`]: DateSchema.optional(),
  [`${field}Gt`]: DateSchema.optional(),
}) as Record<K | `${K}${'Le' | 'Lt' | 'Ge' | 'Gt'}`, z.ZodOptional<typeof DateSchema>>;

// Credit notes, offers and order confirmations share Fiken's draft and counter endpoints, so one tool covers all three
const DocumentTypeSchema = z.enum(['credit_note', 'offer', 'order_confirmation']);
const DOCUMENT_LABELS: Record<z.infer<typeof DocumentTypeSchema>, string> = {
  credit_note: 'Credit note',
  offer: 'Offer',
  order_confirmation: 'Order confirmation',
};

const SalesVatTypeEnum = z.enum([
  'NONE', 'HIGH', 'MEDIUM', 'RAW_FISH', 'LOW', 'EXEMPT_IMPORT_EXPORT', 'EXEMPT', 'OUTSIDE', 'EXEMPT_REVERSE',
]);
const RoundingTypeEnum = z.enum(['none', 'round_half', 'round_whole', 'round_down_half', 'round_down_whole']);

// Spec: invoiceishDraftLine (read-only fields left out)
const SalesLineSchema = z.object({
  productId: IdSchema.optional(),
  description: z.string().max(200).optional(),
  unitPrice: z.number().int().optional(),
  vatType: SalesVatTypeEnum.optional(),
  quantity: z.number(),
  discount: z.number().min(0).max(100).optional(),
  comment: z.string().max(200).optional(),
  incomeAccount: z.string().optional(),
}).strict();

// Spec: creditNoteLineResult, which partialCreditNoteRequest uses for its lines
const CreditNoteLineSchema = SalesLineSchema.extend({ unitPrice: z.number().int() });

const FullCreditNoteSchema = z.object({
  issueDate: DateSchema,
  invoiceId: IdSchema,
  creditNoteText: z.string().max(500).optional(),
}).strict();

const PartialCreditNoteSchema = z.object({
  issueDate: DateSchema,
  invoiceId: IdSchema.optional(),
  creditNoteText: z.string().max(500).optional(),
  lines: z.array(CreditNoteLineSchema).min(1),
  contactId: IdSchema.optional(),
  contactPersonId: IdSchema.optional(),
  currency: CurrencySchema.optional(),
  project: IdSchema.optional(),
  ourReference: z.string().optional(),
  yourReference: z.string().optional(),
  orderReference: z.string().optional(),
  roundingType: RoundingTypeEnum.optional(),
}).strict();

// Spec: invoiceishDraftRequest. type comes from documentType, and the repeating_invoice-only fields are left out
// because the MCP doesn't create recurring invoices
const DraftSchema = z.object({
  customerId: IdSchema,
  daysUntilDueDate: z.number().int().min(0),
  issueDate: DateSchema.optional(),
  lines: z.array(SalesLineSchema).optional(),
  currency: CurrencySchema.optional(),
  invoiceText: z.string().optional(),
  contactPersonId: IdSchema.optional(),
  projectId: IdSchema.optional(),
  yourReference: z.string().optional(),
  ourReference: z.string().optional(),
  orderReference: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  iban: z.string().optional(),
  bic: z.string().optional(),
  paymentAccount: z.string().optional(),
  roundingType: RoundingTypeEnum.optional(),
  uuid: z.string().uuid().optional(),
}).strict();

const companySlug = z.string().optional();
const documentType = DocumentTypeSchema;

/**
 * Each tool's arguments; handlers parse with these, so errors name the field (e.g. "params.pageSize: ..."), and the
 * tests check them against the advertised inputSchema
 */
export const salesDocumentToolArgs = {
  fiken_get_credit_notes: z.object({
    companySlug,
    detail: DetailSchema,
    params: z.object({
      ...PageSchema,
      ...dateFilters('issueDate'),
      ...dateFilters('lastModified'),
      customerId: IdSchema.optional(),
      settled: z.boolean().optional(),
      creditNoteDraftUuid: z.string().uuid().optional(),
    }).optional(),
  }),
  fiken_get_credit_note: z.object({ companySlug, creditNoteId: IdSchema }),
  // creditNote is checked against the full or partial schema in the handler, once kind is known
  fiken_create_credit_note: z.object({
    companySlug,
    kind: z.enum(['full', 'partial']),
    creditNote: z.record(z.unknown()),
  }),
  fiken_get_offers: z.object({ companySlug, detail: DetailSchema, params: z.object(PageSchema).optional() }),
  fiken_get_offer: z.object({ companySlug, offerId: IdSchema }),
  fiken_get_order_confirmations: z.object({ companySlug, detail: DetailSchema, params: z.object(PageSchema).optional() }),
  fiken_get_order_confirmation: z.object({ companySlug, confirmationId: IdSchema }),
  fiken_create_invoice_draft_from_order_confirmation: z.object({ companySlug, confirmationId: IdSchema }),
  fiken_get_sales_document_drafts: z.object({
    companySlug,
    documentType,
    detail: DetailSchema,
    params: z.object(PageSchema).optional(),
  }),
  fiken_get_sales_document_draft: z.object({ companySlug, documentType, draftId: IdSchema }),
  fiken_create_sales_document_draft: z.object({ companySlug, documentType, draft: DraftSchema }),
  fiken_update_sales_document_draft: z.object({ companySlug, documentType, draftId: IdSchema, draft: DraftSchema }),
  fiken_get_sales_document_draft_attachments: z.object({ companySlug, documentType, draftId: IdSchema }),
  fiken_create_sales_document_from_draft: z.object({ companySlug, documentType, draftId: IdSchema }),
  fiken_get_sales_document_counter: z.object({ companySlug, documentType }),
  fiken_create_sales_document_counter: z.object({ companySlug, documentType, value: z.number().int().min(0).optional() }),
  fiken_get_recurring_invoices: z.object({
    companySlug,
    detail: DetailSchema,
    params: z.object({ ...PageSchema, customerId: IdSchema.optional(), active: z.boolean().optional() }).optional(),
  }),
  fiken_get_recurring_invoice: z.object({ companySlug, recurringInvoiceId: IdSchema }),
};

// ---------- summaries for list tools ----------

const toCreditNoteSummary = (note: any) => ({
  creditNoteId: note.creditNoteId,
  creditNoteNumber: note.creditNoteNumber,
  issueDate: note.issueDate,
  customerId: note.customer?.contactId,
  customerName: note.customer?.name,
  currency: note.currency,
  net: note.net,
  vat: note.vat,
  gross: note.gross,
  settled: note.settled,
  associatedInvoiceId: note.associatedInvoiceId,
});

const toOfferSummary = (offer: any) => ({
  offerId: offer.offerId,
  offerNumber: offer.offerNumber,
  date: offer.date,
  contactId: offer.contactId,
  currency: offer.currency,
  net: offer.net,
  vat: offer.vat,
  gross: offer.gross,
  accepted: offer.accepted,
  archived: offer.archived,
});

const toOrderConfirmationSummary = (confirmation: any) => ({
  confirmationId: confirmation.confirmationId,
  confirmationNumber: confirmation.confirmationNumber,
  date: confirmation.date,
  contactId: confirmation.contactId,
  currency: confirmation.currency,
  net: confirmation.net,
  vat: confirmation.vat,
  gross: confirmation.gross,
  createdInvoice: confirmation.createdInvoice,
  archived: confirmation.archived,
});

const toDraftSummary = (draft: any) => ({
  draftId: draft.draftId,
  type: draft.type,
  issueDate: draft.issueDate,
  customerId: draft.customers?.[0]?.contactId,
  customerName: draft.customers?.[0]?.name,
  currency: draft.currency,
  net: draft.net,
  gross: draft.gross,
  lastModifiedDate: draft.lastModifiedDate,
});

const toRecurringInvoiceSummary = (recurring: any) => ({
  recurringInvoiceId: recurring.recurringInvoiceId,
  description: recurring.description,
  active: recurring.active,
  daysUntilDueDate: recurring.daysUntilDueDate,
  jobs: recurring.jobs?.map((job: any) => ({
    jobId: job.jobId,
    customerId: job.customerId,
    frequency: job.frequency,
    nextDate: job.nextDate,
    endDate: job.endDate,
    active: job.active,
    currency: job.currency,
    gross: job.gross,
  })),
});

// ---------- JSON schemas advertised to clients (keep in sync with the zod schemas above) ----------

const AMOUNTS_NOTE = 'Amounts are integer cents (øre) in the document currency.';

const companySlugProperty = {
  type: 'string',
  description: 'Company identifier slug (defaults to env FIKEN_COMPANY_SLUG if omitted)',
};

const detailProperty = (summary: string) => ({
  type: 'string',
  enum: ['summary', 'full'],
  description: `summary (default): ${summary}; full: complete Fiken records (much larger)`,
});

const pageProperties = {
  page: { type: 'number', description: 'Page number (0-based)' },
  pageSize: { type: 'number', description: 'Number of items per page (1-100, default 25)' },
};

const dateFilterProperties = (field: string, label: string) => ({
  [field]: { type: 'string', description: `Filter by exact ${label} (YYYY-MM-DD)` },
  [`${field}Le`]: { type: 'string', description: `Filter by ${label} on or before (YYYY-MM-DD)` },
  [`${field}Lt`]: { type: 'string', description: `Filter by ${label} before (YYYY-MM-DD)` },
  [`${field}Ge`]: { type: 'string', description: `Filter by ${label} on or after (YYYY-MM-DD)` },
  [`${field}Gt`]: { type: 'string', description: `Filter by ${label} after (YYYY-MM-DD)` },
});

const idProperty = (description: string) => ({ type: 'number', description });

const documentTypeProperty = {
  type: 'string',
  enum: DocumentTypeSchema.options,
  description: 'Which kind of sales document',
};

const roundingTypeProperty = {
  type: 'string',
  enum: RoundingTypeEnum.options,
  description: 'Øre rounding of the total, NOK only (default none)',
};

const salesLineProperties = {
  productId: idProperty('Product ID; fills description, price, VAT and account from the product'),
  description: { type: 'string', description: 'Line description (max 200 chars)' },
  unitPrice: { type: 'number', description: 'Net price per unit excluding VAT, in cents (øre)' },
  vatType: { type: 'string', enum: SalesVatTypeEnum.options, description: 'VAT type; HIGH is the most common' },
  quantity: { type: 'number', description: 'Number of units' },
  discount: { type: 'number', description: 'Discount percent (0-100, decimals allowed)' },
  comment: { type: 'string', description: 'Extra text printed on the line (max 200 chars)' },
  incomeAccount: { type: 'string', description: 'Income account, e.g. 3000; defaults to the product\'s' },
};

const salesLinesProperty = {
  type: 'array',
  items: { type: 'object', properties: salesLineProperties, required: ['quantity'], additionalProperties: false },
};

const referenceProperties = {
  yourReference: { type: 'string', description: 'Customer\'s reference' },
  ourReference: { type: 'string', description: 'Our reference' },
  orderReference: { type: 'string', description: 'Order reference, used for EHF' },
};

const draftProperty = {
  type: 'object',
  properties: {
    customerId: idProperty('Customer contact ID (use fiken_get_contacts)'),
    daysUntilDueDate: { type: 'number', description: 'Days from issue date to due date' },
    issueDate: { type: 'string', description: 'Issue date (YYYY-MM-DD)' },
    lines: salesLinesProperty,
    currency: { type: 'string', description: '3-letter ISO currency code (default NOK)' },
    invoiceText: { type: 'string', description: 'Text printed above the lines' },
    contactPersonId: idProperty('Contact person of the customer'),
    projectId: idProperty('Project ID'),
    ...referenceProperties,
    bankAccountNumber: { type: 'string', description: 'Bank account number for payment' },
    iban: { type: 'string' },
    bic: { type: 'string' },
    paymentAccount: { type: 'string', description: 'Payment account, e.g. 1920:10001' },
    roundingType: roundingTypeProperty,
    uuid: { type: 'string', description: 'Optional client-chosen draft UUID' },
  },
  required: ['customerId', 'daysUntilDueDate'],
  additionalProperties: false,
};

const salesDocumentService = (context: FikenContext) => context.client(FikenSalesDocumentService);

export const salesDocumentTools: ToolDefinition[] = [
  // ---------- credit notes ----------
  {
    name: 'fiken_get_credit_notes',
    description: 'List credit notes. Returns a compact summary per credit note (creditNoteId, number, issueDate, ' +
      `customer, amounts, settled, associatedInvoiceId) plus pagination. ${AMOUNTS_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        detail: detailProperty('compact fields per credit note'),
        params: {
          type: 'object',
          properties: {
            ...pageProperties,
            ...dateFilterProperties('issueDate', 'issue date'),
            ...dateFilterProperties('lastModified', 'last modified date'),
            customerId: idProperty('Only credit notes for this customer contact ID'),
            settled: { type: 'boolean', description: 'true: settled only; false: not fully settled only' },
            creditNoteDraftUuid: { type: 'string', description: 'Only the credit note created from this draft UUID' },
          },
        },
      },
      required: [],
    },
    handler: async (args, context) => {
      const { detail, params } = salesDocumentToolArgs.fiken_get_credit_notes.parse(args);
      const response = await salesDocumentService(context).getCreditNotes(context.resolveCompanySlug(args.companySlug), params);
      return listResult('creditNotes', response, detail === 'full' ? undefined : toCreditNoteSummary);
    },
  },
  {
    name: 'fiken_get_credit_note',
    description: `Get one credit note by creditNoteId, with lines, customer and PDF link. ${AMOUNTS_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        creditNoteId: idProperty('Credit note ID (not the credit note number)'),
      },
      required: ['creditNoteId'],
    },
    handler: async (args, context) => {
      const { creditNoteId } = salesDocumentToolArgs.fiken_get_credit_note.parse(args);
      const response = await salesDocumentService(context).getCreditNote(context.resolveCompanySlug(args.companySlug), creditNoteId);
      return jsonResult(response.data);
    },
  },
  {
    name: 'fiken_create_credit_note',
    description: 'Issue a credit note. kind "full" credits a whole invoice (issueDate, invoiceId, creditNoteText only); ' +
      '"partial" credits the given lines, against invoiceId or standalone for contactId. Returns the new creditNoteId.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        kind: { type: 'string', enum: ['full', 'partial'] },
        creditNote: {
          type: 'object',
          properties: {
            issueDate: { type: 'string', description: 'Issue date (YYYY-MM-DD)' },
            invoiceId: idProperty('Invoice to credit; required for full'),
            creditNoteText: { type: 'string', description: 'Text on the credit note (max 500 chars)' },
            lines: {
              ...salesLinesProperty,
              description: 'Partial only, required: lines to credit',
              items: { ...salesLinesProperty.items, required: ['quantity', 'unitPrice'] },
            },
            contactId: idProperty('Partial only: customer contact ID'),
            contactPersonId: idProperty('Partial only: contact person of the customer'),
            currency: { type: 'string', description: 'Partial only: 3-letter ISO currency code' },
            project: idProperty('Partial only: project ID'),
            ...referenceProperties,
            roundingType: roundingTypeProperty,
          },
          required: ['issueDate'],
          additionalProperties: false,
        },
      },
      required: ['kind', 'creditNote'],
    },
    handler: async (args, context) => {
      const { kind } = salesDocumentToolArgs.fiken_create_credit_note.parse(args);
      const service = salesDocumentService(context);
      const slug = context.resolveCompanySlug(args.companySlug);
      const response = kind === 'full'
        ? await service.createFullCreditNote(slug, FullCreditNoteSchema.parse(args.creditNote, { path: ['creditNote'] }))
        : await service.createPartialCreditNote(slug, PartialCreditNoteSchema.parse(args.creditNote, { path: ['creditNote'] }));
      return createdResult('Credit note created', response);
    },
  },

  // ---------- offers ----------
  {
    name: 'fiken_get_offers',
    description: 'List offers (tilbud). Returns a compact summary per offer (offerId, number, date, contactId, ' +
      `amounts, accepted, archived) plus pagination. ${AMOUNTS_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        detail: detailProperty('compact fields per offer'),
        params: { type: 'object', properties: pageProperties },
      },
      required: [],
    },
    handler: async (args, context) => {
      const { detail, params } = salesDocumentToolArgs.fiken_get_offers.parse(args);
      const response = await salesDocumentService(context).getOffers(context.resolveCompanySlug(args.companySlug), params);
      return listResult('offers', response, detail === 'full' ? undefined : toOfferSummary);
    },
  },
  {
    name: 'fiken_get_offer',
    description: `Get one offer by offerId, with lines and dispatch history. ${AMOUNTS_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        offerId: idProperty('Offer ID (not the offer number)'),
      },
      required: ['offerId'],
    },
    handler: async (args, context) => {
      const { offerId } = salesDocumentToolArgs.fiken_get_offer.parse(args);
      const response = await salesDocumentService(context).getOffer(context.resolveCompanySlug(args.companySlug), offerId);
      return jsonResult(response.data);
    },
  },

  // ---------- order confirmations ----------
  {
    name: 'fiken_get_order_confirmations',
    description: 'List order confirmations. Returns a compact summary per confirmation (confirmationId, number, date, ' +
      `contactId, amounts, createdInvoice, archived) plus pagination. ${AMOUNTS_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        detail: detailProperty('compact fields per order confirmation'),
        params: { type: 'object', properties: pageProperties },
      },
      required: [],
    },
    handler: async (args, context) => {
      const { detail, params } = salesDocumentToolArgs.fiken_get_order_confirmations.parse(args);
      const response = await salesDocumentService(context).getOrderConfirmations(context.resolveCompanySlug(args.companySlug), params);
      return listResult('orderConfirmations', response, detail === 'full' ? undefined : toOrderConfirmationSummary);
    },
  },
  {
    name: 'fiken_get_order_confirmation',
    description: `Get one order confirmation by confirmationId, with lines. ${AMOUNTS_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        confirmationId: idProperty('Order confirmation ID (not the confirmation number)'),
      },
      required: ['confirmationId'],
    },
    handler: async (args, context) => {
      const { confirmationId } = salesDocumentToolArgs.fiken_get_order_confirmation.parse(args);
      const response = await salesDocumentService(context).getOrderConfirmation(
        context.resolveCompanySlug(args.companySlug),
        confirmationId,
      );
      return jsonResult(response.data);
    },
  },
  {
    name: 'fiken_create_invoice_draft_from_order_confirmation',
    description: 'Create an invoice draft from an order confirmation. Returns the new invoice draft\'s id; review and ' +
      'issue it with the invoice draft tools.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        confirmationId: idProperty('Order confirmation ID'),
      },
      required: ['confirmationId'],
    },
    handler: async (args, context) => {
      const { confirmationId } = salesDocumentToolArgs.fiken_create_invoice_draft_from_order_confirmation.parse(args);
      const response = await salesDocumentService(context).createInvoiceDraftFromOrderConfirmation(
        context.resolveCompanySlug(args.companySlug),
        confirmationId,
      );
      return createdResult('Invoice draft created', response);
    },
  },

  // ---------- drafts (credit notes, offers, order confirmations) ----------
  {
    name: 'fiken_get_sales_document_drafts',
    description: 'List credit note, offer or order confirmation drafts. Returns a compact summary per draft (draftId, ' +
      `issueDate, customer, net, gross) plus pagination. ${AMOUNTS_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        documentType: documentTypeProperty,
        detail: detailProperty('compact fields per draft'),
        params: { type: 'object', properties: pageProperties },
      },
      required: ['documentType'],
    },
    handler: async (args, context) => {
      const { documentType, detail, params } = salesDocumentToolArgs.fiken_get_sales_document_drafts.parse(args);
      const response = await salesDocumentService(context).getDrafts(
        context.resolveCompanySlug(args.companySlug),
        documentType,
        params,
      );
      return listResult('drafts', response, detail === 'full' ? undefined : toDraftSummary);
    },
  },
  {
    name: 'fiken_get_sales_document_draft',
    description: `Get one credit note, offer or order confirmation draft by draftId, with lines. ${AMOUNTS_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        documentType: documentTypeProperty,
        draftId: idProperty('Draft ID'),
      },
      required: ['documentType', 'draftId'],
    },
    handler: async (args, context) => {
      const { documentType, draftId } = salesDocumentToolArgs.fiken_get_sales_document_draft.parse(args);
      const response = await salesDocumentService(context).getDraft(
        context.resolveCompanySlug(args.companySlug),
        documentType,
        draftId,
      );
      return jsonResult(response.data);
    },
  },
  {
    name: 'fiken_create_sales_document_draft',
    description: 'Create a credit note (standalone), offer or order confirmation draft. Returns the new draftId; ' +
      'issue it with fiken_create_sales_document_from_draft. Use fiken_get_contacts to find customerId.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        documentType: documentTypeProperty,
        draft: draftProperty,
      },
      required: ['documentType', 'draft'],
    },
    handler: async (args, context) => {
      const { documentType, draft } = salesDocumentToolArgs.fiken_create_sales_document_draft.parse(args);
      const response = await salesDocumentService(context).createDraft(
        context.resolveCompanySlug(args.companySlug),
        documentType,
        draft,
      );
      return createdResult('Draft created', response);
    },
  },
  {
    name: 'fiken_update_sales_document_draft',
    description: 'Replace a credit note, offer or order confirmation draft: send every field and line to keep, not ' +
      'just the changes (start from fiken_get_sales_document_draft).',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        documentType: documentTypeProperty,
        draftId: idProperty('Draft ID'),
        draft: draftProperty,
      },
      required: ['documentType', 'draftId', 'draft'],
    },
    handler: async (args, context) => {
      const { documentType, draftId, draft } = salesDocumentToolArgs.fiken_update_sales_document_draft.parse(args);
      const response = await salesDocumentService(context).updateDraft(
        context.resolveCompanySlug(args.companySlug),
        documentType,
        draftId,
        draft,
      );
      return createdResult('Draft updated', response);
    },
  },
  {
    name: 'fiken_get_sales_document_draft_attachments',
    description: 'List the attachments of a credit note, offer or order confirmation draft (uuid, filename, download URL).',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        documentType: documentTypeProperty,
        draftId: idProperty('Draft ID'),
      },
      required: ['documentType', 'draftId'],
    },
    handler: async (args, context) => {
      const { documentType, draftId } = salesDocumentToolArgs.fiken_get_sales_document_draft_attachments.parse(args);
      const response = await salesDocumentService(context).getDraftAttachments(
        context.resolveCompanySlug(args.companySlug),
        documentType,
        draftId,
      );
      return jsonResult(response.data);
    },
  },
  {
    name: 'fiken_create_sales_document_from_draft',
    description: 'Issue the credit note, offer or order confirmation from a draft (it gets its number and the draft is ' +
      'used up). Returns the new document\'s id. Does not send it to the customer.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        documentType: documentTypeProperty,
        draftId: idProperty('Draft ID'),
      },
      required: ['documentType', 'draftId'],
    },
    handler: async (args, context) => {
      const { documentType, draftId } = salesDocumentToolArgs.fiken_create_sales_document_from_draft.parse(args);
      const response = await salesDocumentService(context).createFromDraft(
        context.resolveCompanySlug(args.companySlug),
        documentType,
        draftId,
      );
      return createdResult(`${DOCUMENT_LABELS[documentType]} created from draft ${draftId}`, response);
    },
  },

  // ---------- number counters ----------
  {
    name: 'fiken_get_sales_document_counter',
    description: 'Get the current number counter for credit notes, offers or order confirmations. Fails if the ' +
      'counter has not been created yet.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        documentType: documentTypeProperty,
      },
      required: ['documentType'],
    },
    handler: async (args, context) => {
      const { documentType } = salesDocumentToolArgs.fiken_get_sales_document_counter.parse(args);
      const response = await salesDocumentService(context).getCounter(context.resolveCompanySlug(args.companySlug), documentType);
      return jsonResult(response.data);
    },
  },
  {
    name: 'fiken_create_sales_document_counter',
    description: 'Create the number counter for credit notes, offers or order confirmations; needed once before the ' +
      'first document of that kind. Numbering starts at value + 1 (default value 10000).',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        documentType: documentTypeProperty,
        value: { type: 'number', description: 'Base number; the first document gets value + 1 (default 10000)' },
      },
      required: ['documentType'],
    },
    handler: async (args, context) => {
      const { documentType, value } = salesDocumentToolArgs.fiken_create_sales_document_counter.parse(args);
      await salesDocumentService(context).createCounter(
        context.resolveCompanySlug(args.companySlug),
        documentType,
        value === undefined ? undefined : { value },
      );
      return textResult(`${DOCUMENT_LABELS[documentType]} counter created.`);
    },
  },

  // ---------- recurring invoices ----------
  {
    name: 'fiken_get_recurring_invoices',
    description: 'List recurring invoices (repeterende faktura). Returns a compact summary per recurring invoice ' +
      `(recurringInvoiceId, description, active, jobs with customer, frequency, nextDate, gross) plus pagination. ${AMOUNTS_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        detail: detailProperty('compact fields per recurring invoice'),
        params: {
          type: 'object',
          properties: {
            ...pageProperties,
            customerId: idProperty('Only recurring invoices with a job for this customer contact ID'),
            active: { type: 'boolean', description: 'true: with at least one active job; false: with none' },
          },
        },
      },
      required: [],
    },
    handler: async (args, context) => {
      const { detail, params } = salesDocumentToolArgs.fiken_get_recurring_invoices.parse(args);
      const response = await salesDocumentService(context).getRecurringInvoices(context.resolveCompanySlug(args.companySlug), params);
      return listResult('recurringInvoices', response, detail === 'full' ? undefined : toRecurringInvoiceSummary);
    },
  },
  {
    name: 'fiken_get_recurring_invoice',
    description: 'Get one recurring invoice by recurringInvoiceId, with its jobs (one per customer: schedule, ' +
      `recipients, lines, generated invoice ids). ${AMOUNTS_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        recurringInvoiceId: idProperty('Recurring invoice ID'),
      },
      required: ['recurringInvoiceId'],
    },
    handler: async (args, context) => {
      const { recurringInvoiceId } = salesDocumentToolArgs.fiken_get_recurring_invoice.parse(args);
      const response = await salesDocumentService(context).getRecurringInvoice(
        context.resolveCompanySlug(args.companySlug),
        recurringInvoiceId,
      );
      return jsonResult(response.data);
    },
  },
];
