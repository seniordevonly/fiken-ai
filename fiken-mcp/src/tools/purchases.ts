/**
 * Tools for purchases, purchase drafts and their attachments and payments.
 */

import fs from 'node:fs/promises';
import { logger } from 'fiken-shared';
import { z } from 'zod';
import {
  DRAFT_AMOUNTS_NOTE,
  PURCHASE_AMOUNTS_NOTE,
  toPurchaseDraftSummary,
  toPurchaseSummary,
  withAmountSummary,
  withDraftAmountSummary,
} from '../formatters/purchases.js';
import {
  AttachmentFileSchema,
  DraftRequestSchema,
  IdSchema,
  PaymentSchema,
  PURCHASE_ACCRUAL_ACCOUNTS,
  PurchaseAccrualRequestSchema,
  PurchaseDraftQueryParamsSchema,
  PurchaseQueryParamsSchema,
  PurchaseRequestSchema,
  PurchaseVatTypeEnum,
} from '../schemas.js';
import { createdResult, jsonResult, listResult, ToolDefinition } from './types.js';

const companySlugProperty = {
  type: 'string',
  description: 'Company identifier slug (defaults to env FIKEN_COMPANY_SLUG if omitted)',
};

const dateProperty = (description: string) => ({ type: 'string', description: `${description} (YYYY-MM-DD)` });

const accountDescription = 'Account code: 4 digits, optionally ":" and a 5-digit sub-ledger number (e.g. 4000, 1920:10001)';

const paymentJsonSchema = {
  type: 'object',
  properties: {
    date: dateProperty('Payment date'),
    account: { type: 'string', description: `Account paid from, e.g. bank 1920:10001. ${accountDescription}` },
    amount: { type: 'integer', description: 'Amount paid in cents (øre) of the payment currency, e.g. 34000 = 340.00' },
    currency: { type: 'string', description: '3-letter ISO currency code; only when other than NOK' },
    amountInNok: { type: 'integer', description: 'Foreign-currency payments only: NOK actually paid from the bank, in øre. Fiken uses its exchange rate if omitted' },
    fee: { type: 'integer', description: 'Additional fee in øre, always NOK' },
  },
  required: ['date', 'account', 'amount'],
  additionalProperties: false,
};

const draftJsonSchema = {
  type: 'object',
  properties: {
    cash: { type: 'boolean', description: 'true for a cash purchase, false for a supplier invoice' },
    paid: { type: 'boolean', description: 'Whether the purchase is paid (defaults to false); true requires payments' },
    currency: { type: 'string', description: '3-letter uppercase ISO currency code (defaults to NOK)' },
    invoiceIssueDate: dateProperty('Invoice issue date'),
    dueDate: dateProperty('Due date'),
    invoiceNumber: { type: 'string', description: 'Supplier\'s invoice number' },
    contactId: { type: 'integer', description: 'Supplier contact ID' },
    projectId: { type: 'integer', description: 'Project ID for the whole draft' },
    kid: { type: 'string', description: 'KID payment reference (2-25 digits)' },
    payments: {
      type: 'array',
      description: 'Required when paid=true. One or more payment bookings.',
      items: paymentJsonSchema,
    },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Line description (max 200 chars)' },
          vatType: { type: 'string', enum: PurchaseVatTypeEnum.options, description: 'VAT type' },
          incomeAccount: { type: 'string', description: `Expense account for the line, e.g. 4000. ${accountDescription}` },
          net: { type: 'integer', description: 'Net amount in cents (øre) of the draft currency' },
          gross: { type: 'integer', description: 'Gross amount (net + VAT) in cents (øre) of the draft currency' },
          projectId: { type: 'integer', description: 'Project ID for this line' },
        },
        required: ['text', 'vatType', 'incomeAccount', 'net', 'gross'],
        additionalProperties: false,
      },
    },
  },
  required: ['cash', 'lines'],
  additionalProperties: false,
};

export const purchaseTools: ToolDefinition[] = [
  {
    name: 'fiken_get_purchases',
    description: 'Get purchases for a company with optional filtering and pagination. By default returns a compact ' +
      'summary per purchase (purchaseId, date, supplier, description, amounts, paid) plus pagination; use ' +
      'detail="full" for Fiken\'s complete records, or fiken_get_purchase for one purchase. ' + PURCHASE_AMOUNTS_NOTE,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        detail: {
          type: 'string',
          enum: ['summary', 'full'],
          description: 'summary (default): compact fields per purchase; full: complete Fiken records (much larger)',
        },
        params: {
          type: 'object',
          properties: {
            page: { type: 'integer', description: 'Page number (0-based)' },
            pageSize: { type: 'integer', description: 'Number of items per page (1-100, default 25)' },
            date: dateProperty('Exact purchase date'),
            dateLe: dateProperty('Purchase date on or before'),
            dateLt: dateProperty('Purchase date before'),
            dateGe: dateProperty('Purchase date on or after'),
            dateGt: dateProperty('Purchase date after'),
            lastModified: dateProperty('Last modified on'),
            lastModifiedLe: dateProperty('Last modified on or before'),
            lastModifiedLt: dateProperty('Last modified before'),
            lastModifiedGe: dateProperty('Last modified on or after'),
            lastModifiedGt: dateProperty('Last modified after'),
            sortBy: { type: 'string', enum: ['date asc', 'date desc'], description: 'Sort order (default date asc)' },
            paid: { type: 'boolean', description: 'true: only paid purchases; false: purchases not fully settled' },
            settledDate: dateProperty('Settled on'),
            settledDateLe: dateProperty('Settled on or before'),
            settledDateLt: dateProperty('Settled before'),
            settledDateGe: dateProperty('Settled on or after'),
            settledDateGt: dateProperty('Settled after'),
            contactId: { type: 'integer', description: 'Only purchases from this supplier contact' },
          },
          additionalProperties: false,
        },
      },
      required: [],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const companySlug = context.resolveCompanySlug(args.companySlug);
      const detail = z.enum(['summary', 'full']).default('summary').parse(args.detail, { path: ['detail'] });
      const queryParams = args.params ? PurchaseQueryParamsSchema.parse(args.params, { path: ['params'] }) : undefined;

      const result = await context.purchases.getPurchases(companySlug, queryParams);
      return listResult('purchases', result, detail === 'full' ? withAmountSummary : toPurchaseSummary);
    },
  },
  {
    name: 'fiken_create_purchase',
    description: 'Create a purchase (supplier invoice or cash purchase). Amounts are integer cents (øre): 12500 = 125.00. ' +
      'Returns the new purchaseId as "id".',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        purchase: {
          type: 'object',
          properties: {
            date: dateProperty('Purchase date'),
            kind: { type: 'string', enum: ['cash_purchase', 'supplier'], description: 'cash_purchase: paid on the spot; supplier: invoice from a supplier' },
            paid: { type: 'boolean', description: 'Whether the purchase is paid (defaults to false)' },
            currency: { type: 'string', description: '3-letter uppercase ISO currency code, e.g. NOK' },
            identifier: { type: 'string', description: 'Supplier\'s invoice number, receipt number or similar' },
            dueDate: dateProperty('Due date'),
            supplierId: { type: 'integer', description: 'Supplier contact ID (contactId); for kind=supplier' },
            paymentAccount: { type: 'string', description: `Account paid from, e.g. 1920:10001; needed for cash_purchase and paid purchases. ${accountDescription}` },
            paymentDate: dateProperty('Payment date'),
            paymentAmountInNok: { type: 'integer', description: 'Paid foreign-currency purchases: NOK actually paid from the bank, in øre' },
            kid: { type: 'string', description: 'KID payment reference (2-25 digits)' },
            projectId: { type: 'integer', description: 'Project ID for the whole purchase' },
            lines: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string', description: 'Line description (max 200 chars)' },
                  vatType: { type: 'string', enum: PurchaseVatTypeEnum.options, description: 'VAT type' },
                  netPrice: { type: 'integer', description: 'Net amount in NOK øre. Either netPrice or netPriceInCurrency is required' },
                  vat: { type: 'integer', description: 'VAT amount in NOK øre' },
                  netPriceInCurrency: { type: 'integer', description: 'Net amount in cents of the purchase currency (for non-NOK purchases)' },
                  vatInCurrency: { type: 'integer', description: 'VAT amount in cents of the purchase currency (for non-NOK purchases)' },
                  account: { type: 'string', description: `Expense account, e.g. 4000. ${accountDescription}` },
                  projectId: { type: 'integer', description: 'Project ID for this line' },
                },
                required: ['description', 'vatType'],
                additionalProperties: false,
              },
            },
          },
          required: ['date', 'kind', 'currency', 'lines'],
          additionalProperties: false,
        },
      },
      required: ['purchase'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const companySlug = context.resolveCompanySlug(args.companySlug);
      const validatedPurchase = PurchaseRequestSchema.parse(args.purchase, { path: ['purchase'] });

      const result = await context.purchases.createPurchase(companySlug, validatedPurchase);
      return createdResult('Purchase created.', result);
    },
  },
  {
    name: 'fiken_get_purchase',
    description: `Get a specific purchase by ID. ${PURCHASE_AMOUNTS_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        purchaseId: { type: 'integer', description: 'Purchase ID' },
      },
      required: ['purchaseId'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const companySlug = context.resolveCompanySlug(args.companySlug);
      const purchaseId = IdSchema.parse(args.purchaseId, { path: ['purchaseId'] });

      const result = await context.purchases.getPurchase(companySlug, purchaseId);
      return jsonResult(withAmountSummary(result.data));
    },
  },
  // Disabled: deleting books a reversal that cannot be undone; re-enable deliberately if an agent should be able to do this
  // {
  //   name: 'fiken_delete_purchase',
  //   description: 'Delete a purchase. Fiken keeps it with deleted=true and books a reverse transaction. Returns the updated purchase.',
  //   inputSchema: {
  //     type: 'object',
  //     properties: {
  //       companySlug: companySlugProperty,
  //       purchaseId: { type: 'integer', description: 'Purchase ID to delete' },
  //       description: { type: 'string', description: 'Reason for the deletion (required)' },
  //     },
  //     required: ['purchaseId', 'description'],
  //   },
  //   handler: async (args, context) => {
  //     context.ensureConfigured();
  //     const companySlug = context.resolveCompanySlug(args.companySlug);
  //     const purchaseId = IdSchema.parse(args.purchaseId, { path: ['purchaseId'] });
  //     const description = z.string().min(1).parse(args.description, { path: ['description'] });
  //
  //     const result = await context.purchases.deletePurchase(companySlug, purchaseId, description);
  //     return jsonResult(withAmountSummary(result.data));
  //   },
  // },
  {
    name: 'fiken_get_purchase_drafts',
    description: 'Get purchase drafts. By default returns a compact summary per draft (draftId, dates, contact, ' +
      'description, amounts, attachment count) plus pagination; use detail="full" for complete drafts. ' + DRAFT_AMOUNTS_NOTE,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        detail: {
          type: 'string',
          enum: ['summary', 'full'],
          description: 'summary (default): compact fields per draft; full: complete Fiken drafts',
        },
        params: {
          type: 'object',
          properties: {
            page: { type: 'integer', description: 'Page number (0-based)' },
            pageSize: { type: 'integer', description: 'Number of items per page (1-100, default 25)' },
          },
          additionalProperties: false,
        },
      },
      required: [],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const companySlug = context.resolveCompanySlug(args.companySlug);
      const detail = z.enum(['summary', 'full']).default('summary').parse(args.detail, { path: ['detail'] });
      const queryParams = args.params ? PurchaseDraftQueryParamsSchema.parse(args.params, { path: ['params'] }) : undefined;

      const result = await context.purchases.getPurchaseDrafts(companySlug, queryParams);
      return listResult('drafts', result, detail === 'full' ? withDraftAmountSummary : toPurchaseDraftSummary);
    },
  },
  {
    name: 'fiken_create_purchase_draft',
    description: 'Create a purchase draft. Amounts are integer cents (øre): 12500 = 125.00. ' +
      'Returns the new draftId as "id", e.g. for fiken_add_attachment_to_purchase_draft.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        draft: draftJsonSchema,
      },
      required: ['draft'],
      additionalProperties: false,
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const companySlug = context.resolveCompanySlug(args.companySlug);
      const validatedDraft = DraftRequestSchema.parse(args.draft, { path: ['draft'] });
      logger.debug('Creating purchase draft, validatedDraft', { validatedDraft });

      const result = await context.purchases.createPurchaseDraft(companySlug, validatedDraft);
      return createdResult('Purchase draft created.', result);
    },
  },
  {
    name: 'fiken_get_purchase_draft',
    description: `Get a specific purchase draft by ID. ${DRAFT_AMOUNTS_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        draftId: { type: 'integer', description: 'Purchase draft ID' },
      },
      required: ['draftId'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const companySlug = context.resolveCompanySlug(args.companySlug);
      const draftId = IdSchema.parse(args.draftId, { path: ['draftId'] });

      const result = await context.purchases.getPurchaseDraft(companySlug, draftId);
      return jsonResult(withDraftAmountSummary(result.data));
    },
  },
  {
    name: 'fiken_update_purchase_draft',
    description: 'Replace a purchase draft: send the complete draft (all fields and lines), not only the changes. ' +
      'Amounts are integer cents (øre). Read it first with fiken_get_purchase_draft.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        draftId: { type: 'integer', description: 'Purchase draft ID' },
        draft: draftJsonSchema,
      },
      required: ['draftId', 'draft'],
      additionalProperties: false,
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const companySlug = context.resolveCompanySlug(args.companySlug);
      const draftId = IdSchema.parse(args.draftId, { path: ['draftId'] });
      const validatedDraft = DraftRequestSchema.parse(args.draft, { path: ['draft'] });

      const result = await context.purchases.updatePurchaseDraft(companySlug, draftId, validatedDraft);
      return createdResult('Purchase draft updated.', result);
    },
  },
  {
    name: 'fiken_create_purchase_from_draft',
    description: 'Book a purchase draft as a purchase. Returns the new purchaseId as "id".',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        draftId: { type: 'integer', description: 'Purchase draft ID' },
      },
      required: ['draftId'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const companySlug = context.resolveCompanySlug(args.companySlug);
      const draftId = IdSchema.parse(args.draftId, { path: ['draftId'] });

      const result = await context.purchases.createPurchaseFromDraft(companySlug, draftId);
      return createdResult('Purchase created from draft.', result);
    },
  },
  {
    name: 'fiken_get_purchase_draft_attachments',
    description: 'Get all attachments for a purchase draft, as { attachments }',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        draftId: { type: 'integer', description: 'Purchase draft ID' },
      },
      required: ['draftId'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const companySlug = context.resolveCompanySlug(args.companySlug);
      const draftId = IdSchema.parse(args.draftId, { path: ['draftId'] });

      const result = await context.purchases.getPurchaseDraftAttachments(companySlug, draftId);
      return listResult('attachments', result);
    },
  },
  {
    name: 'fiken_add_attachment_to_purchase_draft',
    description: 'Upload a file from local disk (e.g. the supplier invoice or receipt) to a purchase draft. ' +
      'Allowed types: .png, .jpeg, .jpg, .gif, .pdf.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        draftId: { type: 'integer', description: 'Purchase draft ID' },
        attachment: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Filename shown in Fiken; its extension sets the file type (.png, .jpeg, .jpg, .gif or .pdf)' },
            filePath: { type: 'string', description: 'Absolute or relative path to the file on disk' },
          },
          required: ['filename', 'filePath'],
          additionalProperties: false,
        },
      },
      required: ['draftId', 'attachment'],
    },
    // Reads filePath from the server's disk, which a remote caller must not be able to do
    http: false,
    handler: async (args, context) => {
      context.ensureConfigured();
      const companySlug = context.resolveCompanySlug(args.companySlug);
      const draftId = IdSchema.parse(args.draftId, { path: ['draftId'] });
      const att = AttachmentFileSchema.parse(args.attachment, { path: ['attachment'] });
      const file = await fs.readFile(att.filePath);

      const result = await context.purchases.addAttachmentToPurchaseDraft(companySlug, draftId, {
        filename: att.filename,
        file,
      });
      return createdResult('Attachment uploaded to purchase draft.', result);
    },
  },
  {
    name: 'fiken_get_purchase_attachments',
    description: 'Get the attachments (invoice, receipt files) of a purchase, as { attachments }',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        purchaseId: { type: 'integer', description: 'Purchase ID' },
      },
      required: ['purchaseId'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const companySlug = context.resolveCompanySlug(args.companySlug);
      const purchaseId = IdSchema.parse(args.purchaseId, { path: ['purchaseId'] });

      const result = await context.purchases.getPurchaseAttachments(companySlug, purchaseId);
      return listResult('attachments', result);
    },
  },
  {
    name: 'fiken_create_purchase_payment',
    description: 'Register a payment of a purchase. Amounts are integer cents (øre): 34000 = 340.00. ' +
      'Returns the new paymentId as "id".',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        purchaseId: { type: 'integer', description: 'Purchase ID' },
        payment: paymentJsonSchema,
      },
      required: ['purchaseId', 'payment'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const companySlug = context.resolveCompanySlug(args.companySlug);
      const purchaseId = IdSchema.parse(args.purchaseId, { path: ['purchaseId'] });
      const validatedPayment = PaymentSchema.parse(args.payment, { path: ['payment'] });

      const result = await context.purchases.createPurchasePayment(companySlug, purchaseId, validatedPayment);
      return createdResult('Payment created.', result);
    },
  },
  {
    name: 'fiken_get_purchase_payments',
    description: 'Get the payments of a purchase, as { payments }. Amounts are integer cents (øre); fee is always NOK.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        purchaseId: { type: 'integer', description: 'Purchase ID' },
      },
      required: ['purchaseId'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const companySlug = context.resolveCompanySlug(args.companySlug);
      const purchaseId = IdSchema.parse(args.purchaseId, { path: ['purchaseId'] });

      const result = await context.purchases.getPurchasePayments(companySlug, purchaseId);
      return listResult('payments', result);
    },
  },
  {
    name: 'fiken_get_purchase_payment',
    description: 'Get one payment of a purchase. Amounts are integer cents (øre); fee is always NOK.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        purchaseId: { type: 'integer', description: 'Purchase ID' },
        paymentId: { type: 'integer', description: 'Payment ID, from fiken_get_purchase_payments' },
      },
      required: ['purchaseId', 'paymentId'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const companySlug = context.resolveCompanySlug(args.companySlug);
      const purchaseId = IdSchema.parse(args.purchaseId, { path: ['purchaseId'] });
      const paymentId = IdSchema.parse(args.paymentId, { path: ['paymentId'] });

      const result = await context.purchases.getPurchasePayment(companySlug, purchaseId, paymentId);
      return jsonResult(result.data);
    },
  },
  {
    name: 'fiken_get_purchase_accruals',
    description: 'Get the accruals (periodisering) set up on a purchase, as { accruals }. amountPerPeriod is in cents (øre).',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        purchaseId: { type: 'integer', description: 'Purchase ID' },
      },
      required: ['purchaseId'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const companySlug = context.resolveCompanySlug(args.companySlug);
      const purchaseId = IdSchema.parse(args.purchaseId, { path: ['purchaseId'] });

      const result = await context.purchases.getPurchaseAccruals(companySlug, purchaseId);
      return listResult('accruals', result);
    },
  },
  {
    name: 'fiken_get_purchase_accrual',
    description: 'Get one accrual (periodisering) on a purchase. amountPerPeriod is in cents (øre).',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        purchaseId: { type: 'integer', description: 'Purchase ID' },
        accrualId: { type: 'integer', description: 'Accrual ID, from fiken_get_purchase_accruals' },
      },
      required: ['purchaseId', 'accrualId'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const companySlug = context.resolveCompanySlug(args.companySlug);
      const purchaseId = IdSchema.parse(args.purchaseId, { path: ['purchaseId'] });
      const accrualId = IdSchema.parse(args.accrualId, { path: ['accrualId'] });

      const result = await context.purchases.getPurchaseAccrual(companySlug, purchaseId, accrualId);
      return jsonResult(result.data);
    },
  },
  {
    name: 'fiken_create_purchase_accrual',
    description: 'Spread one purchase line evenly over monthly periods (periodisering). The line must be on a result ' +
      'account (3000-7999); take its lineId from fiken_get_purchase. Returns the new accrualId as "id".',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        purchaseId: { type: 'integer', description: 'Purchase ID' },
        accrual: {
          type: 'object',
          properties: {
            lineId: { type: 'integer', description: 'lineId of the purchase line to accrue' },
            startDate: dateProperty('First period (month)'),
            periods: { type: 'integer', description: 'Number of monthly periods (1-120)' },
            account: {
              type: 'string',
              enum: [...PURCHASE_ACCRUAL_ACCOUNTS],
              description: 'Balance account to accrue to, e.g. 1700 (prepaid expenses)',
            },
          },
          required: ['lineId', 'startDate', 'periods', 'account'],
          additionalProperties: false,
        },
      },
      required: ['purchaseId', 'accrual'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const companySlug = context.resolveCompanySlug(args.companySlug);
      const purchaseId = IdSchema.parse(args.purchaseId, { path: ['purchaseId'] });
      const accrual = PurchaseAccrualRequestSchema.parse(args.accrual, { path: ['accrual'] });

      const result = await context.purchases.createPurchaseAccrual(companySlug, purchaseId, accrual);
      return createdResult('Accrual created.', result);
    },
  },
];
