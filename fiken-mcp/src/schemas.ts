/**
 * Zod schemas for validating tool arguments before they reach the Fiken API.
 * They follow the v2 OpenAPI spec (fiken-shared/swagger/swagger.yaml); amounts are integer cents (øre).
 */

import { z } from 'zod';

// VAT types valid on purchase lines (the spec's VAT Code table)
const PURCHASE_VAT_TYPES = [
  'NONE', 'HIGH', 'MEDIUM', 'RAW_FISH', 'LOW',
  'HIGH_DIRECT', 'HIGH_BASIS', 'MEDIUM_DIRECT', 'MEDIUM_BASIS', 'NONE_IMPORT_BASIS',
  'HIGH_FOREIGN_SERVICE_DEDUCTIBLE', 'HIGH_FOREIGN_SERVICE_NONDEDUCTIBLE',
  'LOW_FOREIGN_SERVICE_DEDUCTIBLE', 'LOW_FOREIGN_SERVICE_NONDEDUCTIBLE',
  'HIGH_PURCHASE_OF_EMISSIONSTRADING_OR_GOLD_DEDUCTIBLE',
  'HIGH_PURCHASE_OF_EMISSIONSTRADING_OR_GOLD_NONDEDUCTIBLE',
] as const;

export const PurchaseVatTypeEnum = z.enum(PURCHASE_VAT_TYPES);

// Every VAT type: the purchase ones plus those valid for sales only
export const VatTypeEnum = z.enum([
  ...PURCHASE_VAT_TYPES,
  'EXEMPT_IMPORT_EXPORT', 'EXEMPT', 'OUTSIDE', 'EXEMPT_REVERSE',
] as const);

export const CompanySlugSchema = z.string().min(1, 'Company slug is required');

export const IdSchema = z.number().int().positive();

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

const CurrencySchema = z.string().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter uppercase ISO 4217 code');

// The spec's account format: four digits, optionally ":" and a five-digit sub-ledger (reskontro) number
const AccountSchema = z.string().regex(/^\d{4}(:\d{5})?$/, 'Account must be 4 digits, optionally followed by ":" and 5 digits (e.g. 1920:10001)');

const CentsSchema = z.number().int('Amounts are integer cents (øre)');

export const PurchaseQueryParamsSchema = z.object({
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  date: DateSchema.optional(),
  dateLe: DateSchema.optional(),
  dateLt: DateSchema.optional(),
  dateGe: DateSchema.optional(),
  dateGt: DateSchema.optional(),
  lastModified: DateSchema.optional(),
  lastModifiedLe: DateSchema.optional(),
  lastModifiedLt: DateSchema.optional(),
  lastModifiedGe: DateSchema.optional(),
  lastModifiedGt: DateSchema.optional(),
  sortBy: z.enum(['date asc', 'date desc']).optional(),
  paid: z.boolean().optional(),
  settledDate: DateSchema.optional(),
  settledDateLe: DateSchema.optional(),
  settledDateLt: DateSchema.optional(),
  settledDateGe: DateSchema.optional(),
  settledDateGt: DateSchema.optional(),
  contactId: IdSchema.optional(),
});

export const PurchaseDraftQueryParamsSchema = z.object({
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export const PurchaseLineSchema = z.object({
  description: z.string().min(1, 'Line description is required').max(200, 'Description must be 200 characters or less'),
  netPrice: CentsSchema.optional(),
  vat: CentsSchema.optional(),
  account: AccountSchema.optional(),
  vatType: PurchaseVatTypeEnum,
  netPriceInCurrency: CentsSchema.optional(),
  vatInCurrency: CentsSchema.optional(),
  projectId: IdSchema.optional(),
}).refine(line => line.netPrice !== undefined || line.netPriceInCurrency !== undefined, {
  message: 'Either netPrice or netPriceInCurrency is required',
  path: ['netPrice'],
});

export const PurchaseRequestSchema = z.object({
  date: DateSchema,
  kind: z.enum(['cash_purchase', 'supplier']),
  paid: z.boolean().default(false),
  currency: CurrencySchema,
  lines: z.array(PurchaseLineSchema).min(1, 'At least one line is required'),
  identifier: z.string().optional(),
  dueDate: DateSchema.optional(),
  supplierId: IdSchema.optional(),
  paymentAccount: AccountSchema.optional(),
  paymentDate: DateSchema.optional(),
  paymentAmountInNok: CentsSchema.optional(),
  kid: z.string().optional(),
  projectId: IdSchema.optional(),
});

export const PaymentSchema = z.object({
  date: DateSchema,
  account: AccountSchema,
  amount: CentsSchema.positive('Amount must be positive'),
  amountInNok: CentsSchema.positive().optional(),
  currency: CurrencySchema.optional(),
  fee: CentsSchema.optional(),
});

export const DraftLineSchema = z.object({
  text: z.string().min(1, 'Line text is required').max(200, 'Text must be 200 characters or less'),
  vatType: PurchaseVatTypeEnum,
  incomeAccount: AccountSchema,
  net: CentsSchema,
  gross: CentsSchema,
  projectId: IdSchema.optional(),
});

export const DraftRequestSchema = z.object({
  cash: z.boolean(),
  paid: z.boolean().default(false),
  lines: z.array(DraftLineSchema).min(1, 'At least one line is required'),
  currency: CurrencySchema.optional(),
  invoiceIssueDate: DateSchema.optional(),
  dueDate: DateSchema.optional(),
  invoiceNumber: z.string().optional(),
  contactId: IdSchema.optional(),
  projectId: IdSchema.optional(),
  kid: z.string().optional(),
  payments: z.array(PaymentSchema).optional(),
}).refine((data) => {
  // When paid is true, payments array is required and must have at least one payment
  if (data.paid && (!data.payments || data.payments.length === 0)) {
    return false;
  }
  return true;
}, {
  message: 'When paid is true, at least one payment is required',
  path: ['payments'],
});

// Accounts the spec allows for purchase accruals
export const PURCHASE_ACCRUAL_ACCOUNTS = ['1397', '1700', '1710', '1742', '1743', '1744', '1749', '2961'] as const;

export const PurchaseAccrualRequestSchema = z.object({
  lineId: IdSchema,
  startDate: DateSchema,
  periods: z.number().int().min(1).max(120),
  // The spec's description calls it required, though its required list omits it
  account: z.enum(PURCHASE_ACCRUAL_ACCOUNTS),
});

// Upload of a local file; Fiken infers the file type from the filename's extension
export const AttachmentFileSchema = z.object({
  filename: z.string().regex(/\.(png|jpe?g|gif|pdf)$/i, 'Filename must end with .png, .jpeg, .jpg, .gif or .pdf'),
  filePath: z.string().min(1),
});
