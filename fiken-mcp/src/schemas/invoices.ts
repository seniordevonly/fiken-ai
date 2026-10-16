/**
 * Zod schemas for invoice and invoice draft tool arguments, following Fiken's v2 OpenAPI spec.
 * Request objects are strict so that a misspelt or outdated field name (e.g. contactId, count) is rejected
 * instead of silently dropped.
 */

import { z } from 'zod';
import { IdSchema } from '../schemas.js';

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in YYYY-MM-DD format');
const CentsSchema = z.number().int('Must be an integer amount in cents (øre)');
const CurrencySchema = z.string().regex(/^[A-Z]{3}$/, 'Must be a 3-letter uppercase ISO 4217 code, e.g. NOK');
const PercentSchema = z.number().min(0).max(100);
const UuidSchema = z.string().uuid();

export const InvoiceVatTypeEnum = z.enum([
  'HIGH', 'MEDIUM', 'LOW', 'EXEMPT', 'EXEMPT_IMPORT_EXPORT', 'EXEMPT_REVERSE', 'OUTSIDE', 'NONE',
]);
export const SalesVatTypeEnum = z.enum([...InvoiceVatTypeEnum.options, 'RAW_FISH']);
export const RoundingTypeEnum = z.enum(['none', 'round_half', 'round_whole', 'round_down_half', 'round_down_whole']);
// repeating_invoice is left out: a recurring invoice can't be activated through the MCP, so such a draft would be a dead end
export const InvoiceDraftTypeEnum = z.enum(['invoice', 'cash_invoice', 'offer', 'order_confirmation', 'credit_note']);
export const SendMethodEnum = z.enum(['email', 'ehf', 'efaktura', 'sms', 'letter', 'auto']);
export const EmailSendOptionEnum = z.enum(['document_link', 'attachment', 'auto']);
export const DetailEnum = z.enum(['summary', 'full']);

const PaginationShape = {
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
};

export const InvoiceQueryParamsSchema = z.object({
  ...PaginationShape,
  issueDate: DateSchema.optional(),
  issueDateLe: DateSchema.optional(),
  issueDateLt: DateSchema.optional(),
  issueDateGe: DateSchema.optional(),
  issueDateGt: DateSchema.optional(),
  lastModified: DateSchema.optional(),
  lastModifiedLe: DateSchema.optional(),
  lastModifiedLt: DateSchema.optional(),
  lastModifiedGe: DateSchema.optional(),
  lastModifiedGt: DateSchema.optional(),
  dueDate: DateSchema.optional(),
  dueDateLe: DateSchema.optional(),
  dueDateLt: DateSchema.optional(),
  dueDateGe: DateSchema.optional(),
  dueDateGt: DateSchema.optional(),
  customerId: IdSchema.optional(),
  settled: z.boolean().optional(),
  orderReference: z.string().optional(),
  invoiceDraftUuid: UuidSchema.optional(),
  invoiceNumber: z.string().optional(),
}).strict();

export const InvoiceDraftQueryParamsSchema = z.object({
  ...PaginationShape,
  orderReference: z.string().optional(),
  uuid: UuidSchema.optional(),
}).strict();

export const InvoiceLineRequestSchema = z.object({
  net: CentsSchema.optional(),
  vat: CentsSchema.optional(),
  vatType: InvoiceVatTypeEnum.optional(),
  gross: CentsSchema.optional(),
  vatInPercent: PercentSchema.optional(),
  unitPrice: CentsSchema.optional(),
  quantity: z.number(),
  discount: PercentSchema.optional(),
  productName: z.string().optional(),
  productId: IdSchema.optional(),
  description: z.string().max(200).optional(),
  comment: z.string().max(200).optional(),
  incomeAccount: z.string().optional(),
}).strict();

export const InvoiceRequestSchema = z.object({
  uuid: UuidSchema.optional(),
  issueDate: DateSchema,
  dueDate: DateSchema,
  lines: z.array(InvoiceLineRequestSchema).min(1, 'At least one line is required'),
  ourReference: z.string().optional(),
  yourReference: z.string().optional(),
  orderReference: z.string().optional(),
  customerId: IdSchema,
  contactPersonId: IdSchema.optional(),
  bankAccountCode: z.string().min(1),
  currency: CurrencySchema.optional(),
  invoiceText: z.string().max(500).optional(),
  cash: z.boolean(),
  paymentAccount: z.string().optional(),
  projectId: IdSchema.optional(),
  roundingType: RoundingTypeEnum.optional(),
}).strict();

export const UpdateInvoiceRequestSchema = z.object({
  newDueDate: DateSchema.optional(),
  sentManually: z.boolean().optional(),
}).strict().refine(
  updates => updates.newDueDate !== undefined || updates.sentManually !== undefined,
  'Provide newDueDate and/or sentManually',
);

export const SendInvoiceRequestSchema = z.object({
  invoiceId: IdSchema,
  method: z.array(SendMethodEnum).min(1, 'At least one method is required'),
  // Required by Fiken, but the spec gives it a default, so callers may omit it
  includeDocumentAttachments: z.boolean().default(true),
  recipientName: z.string().optional(),
  recipientEmail: z.string().email().optional(),
  message: z.string().optional(),
  emailSendOption: EmailSendOptionEnum.optional(),
  mergeInvoiceAndAttachments: z.boolean().optional(),
  organizationNumber: z.string().optional(),
  mobileNumber: z.string().optional(),
}).strict();

// Lines read from a draft carry read-only ids; drop them so a fetched draft can be edited and sent back
const withoutReadOnlyLineFields = (line: unknown) => {
  if (!line || typeof line !== 'object') return line;
  const { invoiceishDraftLineId, lastModifiedDate, ...rest } = line as Record<string, unknown>;
  return rest;
};

export const InvoiceDraftLineSchema = z.preprocess(withoutReadOnlyLineFields, z.object({
  productId: IdSchema.optional(),
  description: z.string().max(200).optional(),
  unitPrice: CentsSchema.optional(),
  vatType: SalesVatTypeEnum.optional(),
  quantity: z.number(),
  discount: PercentSchema.optional(),
  comment: z.string().max(200).optional(),
  incomeAccount: z.string().optional(),
}).strict());

export const InvoiceDraftRequestSchema = z.object({
  type: InvoiceDraftTypeEnum,
  uuid: UuidSchema.optional(),
  issueDate: DateSchema.optional(),
  daysUntilDueDate: z.number().int().min(0),
  invoiceText: z.string().optional(),
  yourReference: z.string().optional(),
  ourReference: z.string().optional(),
  orderReference: z.string().optional(),
  lines: z.array(InvoiceDraftLineSchema).optional(),
  currency: CurrencySchema.optional(),
  bankAccountNumber: z.string().optional(),
  iban: z.string().optional(),
  bic: z.string().optional(),
  paymentAccount: z.string().optional(),
  customerId: IdSchema,
  contactPersonId: IdSchema.optional(),
  projectId: IdSchema.optional(),
  roundingType: RoundingTypeEnum.optional(),
}).strict();

export const CounterSchema = z.object({
  value: z.number().int().optional(),
}).strict();
