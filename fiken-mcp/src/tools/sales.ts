/**
 * Tools for sales (salg), sale drafts, and their payments, accruals and attachments. Deleting, settling,
 * writing off and uploading attachments are left out on purpose.
 */

import { FikenSaleService } from 'fiken-shared';
import { z } from 'zod';
import { SALE_AMOUNTS_NOTE, toSaleDraftSummary, toSaleSummary, withSaleAmountSummary } from '../formatters/sales.js';
import { IdSchema, PaymentSchema } from '../schemas.js';
import { createdResult, jsonResult, listResult, type ToolDefinition } from './types.js';

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in YYYY-MM-DD format');
const CentsSchema = z.number().int('Must be an integer amount in cents (øre)');
const CurrencySchema = z.string().regex(/^[A-Z]{3}$/, 'Must be a 3-letter uppercase ISO 4217 code, e.g. NOK');
const KidSchema = z.string().regex(/^\d{2,25}$/, 'KID must be 2 to 25 digits');
const DetailEnum = z.enum(['summary', 'full']);
const SaleKindEnum = z.enum(['cash_sale', 'invoice', 'external_invoice']);
const SalesVatTypeEnum = z.enum([
  'NONE', 'HIGH', 'MEDIUM', 'RAW_FISH', 'LOW', 'EXEMPT_IMPORT_EXPORT', 'EXEMPT', 'OUTSIDE', 'EXEMPT_REVERSE',
]);
// The only accounts Fiken accepts for accruing a sale line
const SaleAccrualAccountEnum = z.enum(['1530', '2965']);

// Request objects are strict so a misspelt field (e.g. contactId on a sale) is rejected instead of silently dropped
const PageSchemas = {
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
};

const SaleQueryParamsSchema = z.object({
  ...PageSchemas,
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
  saleNumber: z.string().optional(),
  settled: z.boolean().optional(),
  contactId: IdSchema.optional(),
}).strict();

const SaleDraftQueryParamsSchema = z.object(PageSchemas).strict();

const SaleLineSchema = z.object({
  description: z.string().min(1, 'Line description is required').max(200),
  netPrice: CentsSchema.optional(),
  vat: CentsSchema.optional(),
  netPriceInCurrency: CentsSchema.optional(),
  vatInCurrency: CentsSchema.optional(),
  account: z.string().optional(),
  vatType: SalesVatTypeEnum,
}).strict().refine(line => line.netPrice !== undefined || line.netPriceInCurrency !== undefined, {
  message: 'Either netPrice or netPriceInCurrency is required',
  path: ['netPrice'],
});

const SaleRequestSchema = z.object({
  saleNumber: z.string().optional(),
  date: DateSchema,
  kind: SaleKindEnum,
  totalPaid: CentsSchema.optional(),
  totalPaidInCurrency: CentsSchema.optional(),
  lines: z.array(SaleLineSchema).min(1, 'At least one line is required'),
  customerId: IdSchema.optional(),
  currency: CurrencySchema,
  dueDate: DateSchema.optional(),
  kid: KidSchema.optional(),
  paymentAccount: z.string().optional(),
  paymentDate: DateSchema.optional(),
  paymentFee: CentsSchema.optional(),
  projectId: IdSchema.optional(),
}).strict();

const SalePaymentSchema = PaymentSchema.strict();

const SaleDraftLineSchema = z.object({
  text: z.string().min(1, 'Line text is required').max(200),
  vatType: SalesVatTypeEnum,
  incomeAccount: z.string().min(1, 'Income account is required'),
  net: CentsSchema,
  gross: CentsSchema,
  projectId: IdSchema.optional(),
}).strict();

const SaleDraftRequestSchema = z.object({
  invoiceIssueDate: DateSchema.optional(),
  dueDate: DateSchema.optional(),
  invoiceNumber: z.string().optional(),
  contactId: IdSchema.optional(),
  projectId: IdSchema.optional(),
  cash: z.boolean(),
  currency: CurrencySchema.optional(),
  kid: KidSchema.optional(),
  paid: z.boolean().default(false),
  payments: z.array(SalePaymentSchema).optional(),
  lines: z.array(SaleDraftLineSchema).min(1, 'At least one line is required'),
}).strict();

const SaleAccrualRequestSchema = z.object({
  lineId: IdSchema,
  startDate: DateSchema,
  periods: z.number().int().min(1).max(120),
  account: SaleAccrualAccountEnum,
}).strict();

// Each tool's arguments as one zod object: issues are reported per field (e.g. "sale.lines.0.vatType"), and the
// tests check every inputSchema against the same keys
const toolArgs = <T extends z.ZodRawShape>(shape: T) => z.object({ companySlug: z.string().optional(), ...shape });

export const saleToolArgs = {
  fiken_get_sales: toolArgs({ detail: DetailEnum.default('summary'), params: SaleQueryParamsSchema.optional() }),
  fiken_get_sale: toolArgs({ saleId: IdSchema }),
  fiken_create_sale: toolArgs({ sale: SaleRequestSchema }),
  fiken_get_sale_attachments: toolArgs({ saleId: IdSchema }),
  fiken_get_sale_payments: toolArgs({ saleId: IdSchema }),
  fiken_get_sale_payment: toolArgs({ saleId: IdSchema, paymentId: IdSchema }),
  fiken_create_sale_payment: toolArgs({ saleId: IdSchema, payment: SalePaymentSchema }),
  fiken_get_sale_accruals: toolArgs({ saleId: IdSchema }),
  fiken_get_sale_accrual: toolArgs({ saleId: IdSchema, accrualId: IdSchema }),
  fiken_create_sale_accrual: toolArgs({ saleId: IdSchema, accrual: SaleAccrualRequestSchema }),
  fiken_get_sale_drafts: toolArgs({ detail: DetailEnum.default('summary'), params: SaleDraftQueryParamsSchema.optional() }),
  fiken_get_sale_draft: toolArgs({ draftId: IdSchema }),
  fiken_create_sale_draft: toolArgs({ draft: SaleDraftRequestSchema }),
  fiken_update_sale_draft: toolArgs({ draftId: IdSchema, draft: SaleDraftRequestSchema }),
  fiken_get_sale_draft_attachments: toolArgs({ draftId: IdSchema }),
  fiken_create_sale_from_draft: toolArgs({ draftId: IdSchema }),
};

// ---------- JSON schema building blocks ----------

const companySlug = {
  type: 'string',
  description: 'Company identifier slug (defaults to env FIKEN_COMPANY_SLUG if omitted)',
};
const id = (description: string) => ({ type: 'integer', minimum: 1, description });
const date = (description: string) => ({ type: 'string', format: 'date', description: `${description} (YYYY-MM-DD)` });
const cents = (description: string) => ({ type: 'integer', description: `${description}, in cents (øre)` });
const detail = {
  type: 'string',
  enum: DetailEnum.options,
  description: 'summary (default): compact fields per item; full: complete Fiken records (much larger)',
};
const pagination = {
  page: { type: 'integer', minimum: 0, description: 'Page number (0-based, default 0)' },
  pageSize: { type: 'integer', minimum: 1, maximum: 100, description: 'Items per page (1-100, default 25)' },
};
const saleId = id('Sale ID');
const draftId = id('Sale draft ID');
const kid = { type: 'string', pattern: '^\\d{2,25}$', description: 'Norwegian KID payment reference (2-25 digits)' };
const currency = { type: 'string', pattern: '^[A-Z]{3}$', description: 'ISO 4217 currency code, e.g. NOK' };

const payment = {
  type: 'object',
  properties: {
    date: date('Payment date'),
    account: { type: 'string', description: 'Bank or cash account the money went to, e.g. 1920:10001' },
    amount: { ...cents('Amount received in the payment currency'), minimum: 1 },
    amountInNok: { ...cents('Foreign-currency payments only: the NOK amount that reached the bank'), minimum: 1 },
    currency: { type: 'string', pattern: '^[A-Z]{3}$', description: 'Only when other than NOK (ISO 4217)' },
    fee: cents('Payment fee, always NOK'),
  },
  required: ['date', 'account', 'amount'],
  additionalProperties: false,
};

const saleDraft = {
  type: 'object',
  properties: {
    invoiceIssueDate: date('Issue date'),
    dueDate: date('Due date'),
    invoiceNumber: { type: 'string', description: 'Invoice number, if the invoice was made outside Fiken' },
    contactId: id('Customer contact ID (use fiken_get_contacts to find it)'),
    projectId: id('Project ID for the whole draft'),
    cash: { type: 'boolean', description: 'true for a cash sale, false for a sale on credit' },
    currency,
    kid,
    paid: { type: 'boolean', description: 'Whether the sale is paid (defaults to false); if true, add payments' },
    payments: { type: 'array', items: payment },
    lines: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', maxLength: 200, description: 'Line description' },
          vatType: { type: 'string', enum: SalesVatTypeEnum.options },
          incomeAccount: { type: 'string', description: 'Income account, e.g. 3000' },
          net: cents('Net amount in the draft currency'),
          gross: cents('Gross amount (net + VAT) in the draft currency'),
          projectId: id('Project ID for this line'),
        },
        required: ['text', 'vatType', 'incomeAccount', 'net', 'gross'],
        additionalProperties: false,
      },
    },
  },
  required: ['cash', 'lines'],
  additionalProperties: false,
};

export const saleTools: ToolDefinition[] = [
  {
    name: 'fiken_get_sales',
    description: 'List sales (salg) with filters and pagination; use settled=false to find sales not fully paid. ' +
      'Returns a compact summary per sale by default; use detail="full" for complete records. ' + SALE_AMOUNTS_NOTE,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        detail,
        params: {
          type: 'object',
          properties: {
            ...pagination,
            date: date('Sale date equals'),
            dateLe: date('Sale date on or before'),
            dateLt: date('Sale date before'),
            dateGe: date('Sale date on or after'),
            dateGt: date('Sale date after'),
            lastModified: date('Last modified on'),
            lastModifiedLe: date('Last modified on or before'),
            lastModifiedLt: date('Last modified before'),
            lastModifiedGe: date('Last modified on or after'),
            lastModifiedGt: date('Last modified after'),
            saleNumber: { type: 'string', description: 'Exact sale number' },
            settled: { type: 'boolean', description: 'true: only settled sales; false: sales not fully settled' },
            contactId: id('Customer contact ID'),
          },
          additionalProperties: false,
        },
      },
      required: [],
    },
    handler: async (input, context) => {
      const args = saleToolArgs.fiken_get_sales.parse(input);
      const response = await context.client(FikenSaleService)
        .getSales(context.resolveCompanySlug(args.companySlug), args.params);
      return listResult('sales', response, args.detail === 'full' ? withSaleAmountSummary : toSaleSummary);
    },
  },
  {
    name: 'fiken_get_sale',
    description: `Get one sale by ID, with its lines, payments and attachments. ${SALE_AMOUNTS_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: { companySlug, saleId },
      required: ['saleId'],
    },
    handler: async (input, context) => {
      const args = saleToolArgs.fiken_get_sale.parse(input);
      const response = await context.client(FikenSaleService)
        .getSale(context.resolveCompanySlug(args.companySlug), args.saleId);
      return jsonResult(withSaleAmountSummary(response.data));
    },
  },
  {
    name: 'fiken_create_sale',
    description: 'Register a sale whose invoice was made outside Fiken ("annet salg"); use the invoice tools for ' +
      'invoices issued from Fiken. Returns the new saleId. Amounts are integer cents (øre).',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        sale: {
          type: 'object',
          properties: {
            saleNumber: { type: 'string', description: 'Your identifier for the sale, e.g. the external invoice number' },
            date: date('Sale date'),
            kind: { type: 'string', enum: SaleKindEnum.options, description: 'cash_sale needs paymentAccount' },
            totalPaid: cents('Amount already paid, NOK'),
            totalPaidInCurrency: cents('Amount already paid, in the sale currency'),
            lines: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string', maxLength: 200 },
                  netPrice: cents('Net amount, NOK (netPrice or netPriceInCurrency is required)'),
                  vat: cents('VAT amount, NOK'),
                  netPriceInCurrency: cents('Net amount in the sale currency (for non-NOK sales)'),
                  vatInCurrency: cents('VAT amount in the sale currency (for non-NOK sales)'),
                  account: { type: 'string', description: 'Income account, e.g. 3000' },
                  vatType: { type: 'string', enum: SalesVatTypeEnum.options },
                },
                required: ['description', 'vatType'],
                additionalProperties: false,
              },
            },
            customerId: id('Customer contact ID (use fiken_get_contacts to find it)'),
            currency,
            dueDate: date('Due date'),
            kid,
            paymentAccount: { type: 'string', description: 'Account the payment went to, e.g. 1920:10001' },
            paymentDate: date('Payment date'),
            paymentFee: cents('Payment fee'),
            projectId: id('Project ID'),
          },
          required: ['date', 'kind', 'lines', 'currency'],
          additionalProperties: false,
        },
      },
      required: ['sale'],
    },
    handler: async (input, context) => {
      const args = saleToolArgs.fiken_create_sale.parse(input);
      const response = await context.client(FikenSaleService)
        .createSale(context.resolveCompanySlug(args.companySlug), args.sale);
      return createdResult('Sale created', response);
    },
  },
  {
    name: 'fiken_get_sale_attachments',
    description: 'List the files attached to a sale, with download URLs.',
    inputSchema: {
      type: 'object',
      properties: { companySlug, saleId },
      required: ['saleId'],
    },
    handler: async (input, context) => {
      const args = saleToolArgs.fiken_get_sale_attachments.parse(input);
      const response = await context.client(FikenSaleService)
        .getSaleAttachments(context.resolveCompanySlug(args.companySlug), args.saleId);
      return listResult('attachments', response);
    },
  },
  {
    name: 'fiken_get_sale_payments',
    description: 'List the payments registered on a sale. Amounts are integer cents (øre).',
    inputSchema: {
      type: 'object',
      properties: { companySlug, saleId },
      required: ['saleId'],
    },
    handler: async (input, context) => {
      const args = saleToolArgs.fiken_get_sale_payments.parse(input);
      const response = await context.client(FikenSaleService)
        .getSalePayments(context.resolveCompanySlug(args.companySlug), args.saleId);
      return listResult('payments', response);
    },
  },
  {
    name: 'fiken_get_sale_payment',
    description: 'Get one payment on a sale. Amounts are integer cents (øre).',
    inputSchema: {
      type: 'object',
      properties: { companySlug, saleId, paymentId: id('Payment ID') },
      required: ['saleId', 'paymentId'],
    },
    handler: async (input, context) => {
      const args = saleToolArgs.fiken_get_sale_payment.parse(input);
      const response = await context.client(FikenSaleService)
        .getSalePayment(context.resolveCompanySlug(args.companySlug), args.saleId, args.paymentId);
      return jsonResult(response.data);
    },
  },
  {
    name: 'fiken_create_sale_payment',
    description: 'Register a payment received for a sale. Returns the new paymentId. Amounts are integer cents (øre).',
    inputSchema: {
      type: 'object',
      properties: { companySlug, saleId, payment },
      required: ['saleId', 'payment'],
    },
    handler: async (input, context) => {
      const args = saleToolArgs.fiken_create_sale_payment.parse(input);
      const response = await context.client(FikenSaleService)
        .createSalePayment(context.resolveCompanySlug(args.companySlug), args.saleId, args.payment);
      return createdResult('Sale payment created', response);
    },
  },
  {
    name: 'fiken_get_sale_accruals',
    description: 'List the accruals (periodisering) on a sale. amountPerPeriod is in cents (øre).',
    inputSchema: {
      type: 'object',
      properties: { companySlug, saleId },
      required: ['saleId'],
    },
    handler: async (input, context) => {
      const args = saleToolArgs.fiken_get_sale_accruals.parse(input);
      const response = await context.client(FikenSaleService)
        .getSaleAccruals(context.resolveCompanySlug(args.companySlug), args.saleId);
      return listResult('accruals', response);
    },
  },
  {
    name: 'fiken_get_sale_accrual',
    description: 'Get one accrual (periodisering) on a sale. amountPerPeriod is in cents (øre).',
    inputSchema: {
      type: 'object',
      properties: { companySlug, saleId, accrualId: id('Accrual ID') },
      required: ['saleId', 'accrualId'],
    },
    handler: async (input, context) => {
      const args = saleToolArgs.fiken_get_sale_accrual.parse(input);
      const response = await context.client(FikenSaleService)
        .getSaleAccrual(context.resolveCompanySlug(args.companySlug), args.saleId, args.accrualId);
      return jsonResult(response.data);
    },
  },
  {
    name: 'fiken_create_sale_accrual',
    description: 'Spread one sale line evenly over monthly periods (periodisering). Returns the new accrualId; ' +
      'take lineId from the sale\'s lines in fiken_get_sale.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        saleId,
        accrual: {
          type: 'object',
          properties: {
            lineId: id('lineId of the sale line; must be on a result account (3000-7999)'),
            startDate: date('First month of the accrual'),
            periods: { type: 'integer', minimum: 1, maximum: 120, description: 'Number of months' },
            account: { type: 'string', enum: SaleAccrualAccountEnum.options, description: 'Balance account to accrue to' },
          },
          required: ['lineId', 'startDate', 'periods', 'account'],
          additionalProperties: false,
        },
      },
      required: ['saleId', 'accrual'],
    },
    handler: async (input, context) => {
      const args = saleToolArgs.fiken_create_sale_accrual.parse(input);
      const response = await context.client(FikenSaleService)
        .createSaleAccrual(context.resolveCompanySlug(args.companySlug), args.saleId, args.accrual);
      return createdResult('Sale accrual created', response);
    },
  },
  {
    name: 'fiken_get_sale_drafts',
    description: 'List sale drafts. Returns a compact summary per draft (amounts in major units of the draft ' +
      'currency, 68.5 = 68.50) by default; use detail="full" for complete records, whose amounts are in cents.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        detail,
        params: { type: 'object', properties: pagination, additionalProperties: false },
      },
      required: [],
    },
    handler: async (input, context) => {
      const args = saleToolArgs.fiken_get_sale_drafts.parse(input);
      const response = await context.client(FikenSaleService)
        .getSaleDrafts(context.resolveCompanySlug(args.companySlug), args.params);
      return listResult('drafts', response, args.detail === 'full' ? undefined : toSaleDraftSummary);
    },
  },
  {
    name: 'fiken_get_sale_draft',
    description: 'Get one sale draft by ID. Line net/gross are integer cents (øre) in the draft currency.',
    inputSchema: {
      type: 'object',
      properties: { companySlug, draftId },
      required: ['draftId'],
    },
    handler: async (input, context) => {
      const args = saleToolArgs.fiken_get_sale_draft.parse(input);
      const response = await context.client(FikenSaleService)
        .getSaleDraft(context.resolveCompanySlug(args.companySlug), args.draftId);
      return jsonResult(response.data);
    },
  },
  {
    name: 'fiken_create_sale_draft',
    description: 'Create a sale draft, to book later with fiken_create_sale_from_draft. Returns the new draftId. ' +
      'Line net/gross are integer cents (øre) in the draft currency.',
    inputSchema: {
      type: 'object',
      properties: { companySlug, draft: saleDraft },
      required: ['draft'],
    },
    handler: async (input, context) => {
      const args = saleToolArgs.fiken_create_sale_draft.parse(input);
      const response = await context.client(FikenSaleService)
        .createSaleDraft(context.resolveCompanySlug(args.companySlug), args.draft);
      return createdResult('Sale draft created', response);
    },
  },
  {
    name: 'fiken_update_sale_draft',
    description: 'Replace a sale draft\'s content; send the complete draft, not only the changed fields. ' +
      'Line net/gross are integer cents (øre) in the draft currency.',
    inputSchema: {
      type: 'object',
      properties: { companySlug, draftId, draft: saleDraft },
      required: ['draftId', 'draft'],
    },
    handler: async (input, context) => {
      const args = saleToolArgs.fiken_update_sale_draft.parse(input);
      const response = await context.client(FikenSaleService)
        .updateSaleDraft(context.resolveCompanySlug(args.companySlug), args.draftId, args.draft);
      return createdResult('Sale draft updated', response);
    },
  },
  {
    name: 'fiken_get_sale_draft_attachments',
    description: 'List the files attached to a sale draft, with download URLs.',
    inputSchema: {
      type: 'object',
      properties: { companySlug, draftId },
      required: ['draftId'],
    },
    handler: async (input, context) => {
      const args = saleToolArgs.fiken_get_sale_draft_attachments.parse(input);
      const response = await context.client(FikenSaleService)
        .getSaleDraftAttachments(context.resolveCompanySlug(args.companySlug), args.draftId);
      return listResult('attachments', response);
    },
  },
  {
    name: 'fiken_create_sale_from_draft',
    description: 'Book a sale draft as a sale. Returns the new saleId.',
    inputSchema: {
      type: 'object',
      properties: { companySlug, draftId },
      required: ['draftId'],
    },
    handler: async (input, context) => {
      const args = saleToolArgs.fiken_create_sale_from_draft.parse(input);
      const response = await context.client(FikenSaleService)
        .createSaleFromDraft(context.resolveCompanySlug(args.companySlug), args.draftId);
      return createdResult('Sale created from draft', response);
    },
  },
];
