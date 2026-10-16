/**
 * Tools for invoices, invoice drafts, the invoice counter and invoice attachment lists.
 */

import { IdSchema } from '../schemas.js';
import {
  CounterSchema,
  DetailEnum,
  EmailSendOptionEnum,
  InvoiceDraftQueryParamsSchema,
  InvoiceDraftRequestSchema,
  InvoiceDraftTypeEnum,
  InvoiceQueryParamsSchema,
  InvoiceRequestSchema,
  InvoiceVatTypeEnum,
  RoundingTypeEnum,
  SalesVatTypeEnum,
  SendInvoiceRequestSchema,
  SendMethodEnum,
  UpdateInvoiceRequestSchema,
} from '../schemas/invoices.js';
import { createdResult, jsonResult, listResult, ToolDefinition } from './types.js';

const CENTS_NOTE = 'Amounts are integer cents (øre): 12500 = 125.00.';

const companySlug = {
  type: 'string',
  description: 'Company identifier slug (defaults to env FIKEN_COMPANY_SLUG if omitted)',
};
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
const roundingType = {
  type: 'string',
  enum: RoundingTypeEnum.options,
  description: 'Øreavrunding of the total, NOK only (default none)',
};

const dateFilters = (field: string, label: string) => ({
  [field]: date(`${label} equals`),
  [`${field}Le`]: date(`${label} on or before`),
  [`${field}Lt`]: date(`${label} before`),
  [`${field}Ge`]: date(`${label} on or after`),
  [`${field}Gt`]: date(`${label} after`),
});

// Fields shared by invoice lines and invoice draft lines
const commonLineProperties = {
  quantity: { type: 'number', description: 'Number of units' },
  productId: { type: 'integer', description: 'Product to invoice; its price, VAT type and income account are the defaults' },
  description: { type: 'string', maxLength: 200, description: 'Line description; overrides the product\'s' },
  unitPrice: cents('Net price per unit in the invoice currency; overrides the product price'),
  discount: { type: 'number', minimum: 0, maximum: 100, description: 'Discount percentage (0-100); give amounts before discount' },
  comment: { type: 'string', maxLength: 200, description: 'Extra text printed on the line' },
  incomeAccount: { type: 'string', description: 'Income account, e.g. 3000; defaults to the product\'s' },
};

const invoiceLine = {
  type: 'object',
  properties: {
    ...commonLineProperties,
    productName: { type: 'string', description: 'Name printed on the line; only when productId is omitted' },
    vatType: {
      type: 'string',
      enum: InvoiceVatTypeEnum.options,
      description: 'VAT type (HIGH = 25% is most common); vatType or vatInPercent is needed unless the product sets it',
    },
    vatInPercent: { type: 'number', minimum: 0, maximum: 100, description: 'VAT percentage (0-100)' },
    net: cents('Net line amount in the invoice currency'),
    vat: cents('VAT line amount in the invoice currency'),
    gross: cents('Gross line amount'),
  },
  required: ['quantity'],
  additionalProperties: false,
};

const draftLine = {
  type: 'object',
  properties: {
    ...commonLineProperties,
    vatType: { type: 'string', enum: SalesVatTypeEnum.options, description: 'VAT type (HIGH = 25% is most common)' },
  },
  required: ['quantity'],
  additionalProperties: false,
};

// invoiceishDraftRequest, shared by create and update (PUT replaces the whole draft)
const draftRequest = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: InvoiceDraftTypeEnum.options,
      description: 'Draft type: usually invoice; cash_invoice for cash sales',
    },
    customerId: { type: 'integer', description: 'contactId of a customer contact' },
    contactPersonId: { type: 'integer', description: 'Contact person belonging to the customer' },
    daysUntilDueDate: { type: 'integer', minimum: 0, description: 'Days from issue date to due date' },
    issueDate: date('Issue date'),
    currency: { type: 'string', pattern: '^[A-Z]{3}$', description: 'ISO 4217 currency code (default NOK)' },
    invoiceText: { type: 'string', description: 'Text printed above the lines' },
    yourReference: { type: 'string', description: 'Customer\'s reference' },
    ourReference: { type: 'string', description: 'Our reference' },
    orderReference: { type: 'string', description: 'Order reference (used by EHF)' },
    bankAccountNumber: { type: 'string', description: 'Bank account number printed on the invoice, e.g. 11112233334' },
    iban: { type: 'string', description: 'IBAN' },
    bic: { type: 'string', description: 'BIC/SWIFT' },
    paymentAccount: { type: 'string', description: 'Cash invoices: account the payment went to, e.g. 1920:10001' },
    projectId: { type: 'integer', description: 'Project to associate the draft with' },
    uuid: { type: 'string', format: 'uuid', description: 'Client-chosen draft UUID' },
    roundingType,
    lines: { type: 'array', items: draftLine },
  },
  required: ['type', 'customerId', 'daysUntilDueDate'],
  additionalProperties: false,
};

const lineDescriptions = (lines: unknown): string | undefined => {
  const texts = Array.isArray(lines)
    ? lines.map((line: any) => line?.description || line?.productName).filter(Boolean)
    : [];
  return [...new Set(texts)].join('; ').slice(0, 200) || undefined;
};

// Compact list entry; a full invoice embeds the customer, sale, lines, PDFs and dispatches and overflows agent context
export const toInvoiceSummary = (invoice: any) => ({
  invoiceId: invoice.invoiceId,
  invoiceNumber: invoice.invoiceNumber,
  issueDate: invoice.issueDate,
  dueDate: invoice.dueDate,
  customerId: invoice.customer?.contactId,
  customer: invoice.customer?.name,
  description: lineDescriptions(invoice.lines),
  currency: invoice.currency,
  net: invoice.net,
  vat: invoice.vat,
  gross: invoice.gross,
  grossInNok: invoice.grossInNok,
  settled: invoice.sale?.settled,
  // saleResult.outstandingBalance is NOK; *InCurrency holds the foreign-currency figure
  outstandingBalanceInNok: invoice.sale?.outstandingBalance,
  sent: Boolean(invoice.sentManually || invoice.dispatches?.length),
  kid: invoice.kid,
  orderReference: invoice.orderReference,
});

export const toInvoiceDraftSummary = (draft: any) => ({
  draftId: draft.draftId,
  uuid: draft.uuid,
  type: draft.type,
  issueDate: draft.issueDate,
  daysUntilDueDate: draft.daysUntilDueDate,
  customerId: draft.customers?.[0]?.contactId,
  customer: draft.customers?.[0]?.name,
  description: lineDescriptions(draft.lines),
  currency: draft.currency,
  net: draft.net,
  gross: draft.gross,
  orderReference: draft.orderReference,
  lastModifiedDate: draft.lastModifiedDate,
});

export const invoiceTools: ToolDefinition[] = [
  {
    name: 'fiken_get_invoices',
    description: 'List invoices, filterable by issue/due/last-modified date, customer and settled status. Returns ' +
      '{pagination, invoices}; each invoice is a compact summary (ids, dates, customer, net/vat/gross, settled, ' +
      'outstandingBalanceInNok, sent) unless detail="full". Use fiken_get_invoice for one invoice. ' +
      `${CENTS_NOTE} net/vat/gross are in the invoice currency, *InNok in NOK.`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        detail,
        params: {
          type: 'object',
          properties: {
            ...pagination,
            ...dateFilters('issueDate', 'Issue date'),
            ...dateFilters('dueDate', 'Due date'),
            ...dateFilters('lastModified', 'Last modified'),
            customerId: { type: 'integer', description: 'Only invoices to this customer (contactId)' },
            settled: { type: 'boolean', description: 'true: only fully settled invoices; false: only unsettled ones' },
            orderReference: { type: 'string', description: 'Filter by order reference' },
            invoiceDraftUuid: { type: 'string', format: 'uuid', description: 'Filter by the UUID of the draft the invoice was created from' },
            invoiceNumber: { type: 'string', description: 'Filter by invoice number' },
          },
          additionalProperties: false,
        },
      },
      required: [],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const slug = context.resolveCompanySlug(args.companySlug);
      const level = DetailEnum.default('summary').parse(args.detail, { path: ['detail'] });
      const params = InvoiceQueryParamsSchema.optional().parse(args.params, { path: ['params'] });

      const result = await context.invoices.getInvoices(slug, params);
      return listResult('invoices', result, level === 'full' ? undefined : toInvoiceSummary);
    },
  },
  {
    name: 'fiken_create_invoice',
    description: 'Create an invoice ("Ny faktura"). This books the sale; use fiken_create_invoice_draft for an ' +
      'editable draft. Each line is a product line (productId; price and VAT come from the product) or a free-text ' +
      `line (description, unitPrice and vatType). ${CENTS_NOTE} Returns {message, id, location}; id is the new ` +
      'invoiceId, which fiken_send_invoice takes.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        invoice: {
          type: 'object',
          properties: {
            issueDate: date('Issue date'),
            dueDate: date('Due date'),
            customerId: { type: 'integer', description: 'contactId of a customer contact' },
            contactPersonId: { type: 'integer', description: 'Contact person belonging to the customer' },
            bankAccountCode: { type: 'string', description: 'Bank account the customer pays to, format 1920:XXXXX' },
            cash: { type: 'boolean', description: 'true for a cash invoice (paid on the spot), otherwise false' },
            paymentAccount: { type: 'string', description: 'Cash invoices only: account the payment went to, e.g. 1920:10001' },
            currency: { type: 'string', pattern: '^[A-Z]{3}$', description: 'ISO 4217 currency code (default NOK)' },
            invoiceText: { type: 'string', maxLength: 500, description: 'Text printed above the lines' },
            yourReference: { type: 'string', description: 'Customer\'s reference' },
            ourReference: { type: 'string', description: 'Our reference' },
            orderReference: { type: 'string', description: 'Order reference (used by EHF)' },
            projectId: { type: 'integer', description: 'Project to associate the invoice with' },
            uuid: { type: 'string', format: 'uuid', description: 'Idempotency UUID; Fiken generates one if omitted' },
            roundingType,
            lines: { type: 'array', minItems: 1, items: invoiceLine },
          },
          required: ['issueDate', 'dueDate', 'customerId', 'bankAccountCode', 'cash', 'lines'],
          additionalProperties: false,
        },
      },
      required: ['invoice'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const slug = context.resolveCompanySlug(args.companySlug);
      const invoice = InvoiceRequestSchema.parse(args.invoice, { path: ['invoice'] });

      return createdResult('Invoice created', await context.invoices.createInvoice(slug, invoice));
    },
  },
  {
    name: 'fiken_get_invoice',
    description: 'Get one invoice by invoiceId: Fiken\'s full record with lines, customer, sale (settled, ' +
      `outstandingBalance) and dispatches. ${CENTS_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        invoiceId: { type: 'integer', description: 'Invoice ID' },
      },
      required: ['invoiceId'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const slug = context.resolveCompanySlug(args.companySlug);
      const invoiceId = IdSchema.parse(args.invoiceId, { path: ['invoiceId'] });

      const result = await context.invoices.getInvoice(slug, invoiceId);
      return jsonResult(result.data);
    },
  },
  {
    name: 'fiken_update_invoice',
    description: 'Change an issued invoice\'s due date and/or mark it as sent outside Fiken; these are the only ' +
      'fields Fiken allows changing. Returns {message, invoiceId, location}.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        invoiceId: { type: 'integer', description: 'Invoice ID' },
        updates: {
          type: 'object',
          properties: {
            newDueDate: date('New due date'),
            sentManually: { type: 'boolean', description: 'true if the invoice was sent outside Fiken' },
          },
          additionalProperties: false,
        },
      },
      required: ['invoiceId', 'updates'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const slug = context.resolveCompanySlug(args.companySlug);
      const invoiceId = IdSchema.parse(args.invoiceId, { path: ['invoiceId'] });
      const updates = UpdateInvoiceRequestSchema.parse(args.updates, { path: ['updates'] });

      const response = await context.invoices.updateInvoice(slug, invoiceId, updates);
      // The spec documents no body, only the invoice's URL in Location; pass a body through if Fiken sends one
      const body: unknown = response.data;
      if (body && typeof body === 'object') {
        return jsonResult(body);
      }
      return jsonResult({ message: 'Invoice updated', invoiceId, ...(response.location && { location: response.location }) });
    },
  },
  {
    name: 'fiken_send_invoice',
    description: 'Send an issued invoice to its customer. method lists channels in priority order and Fiken uses ' +
      'the first that works; "auto" tries EHF, eFaktura, SMS, then email from the customer\'s details, and ' +
      '"letter" is a paid printed letter (Norway only). Returns {message, invoiceId, method}.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        sendRequest: {
          type: 'object',
          properties: {
            invoiceId: { type: 'integer', description: 'Invoice ID to send' },
            method: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', enum: SendMethodEnum.options },
              description: 'Channels in priority order, e.g. ["ehf", "email"] or ["auto"]',
            },
            includeDocumentAttachments: {
              type: 'boolean',
              description: 'Include the invoice\'s attachments (default true; ignored for letter)',
            },
            recipientName: { type: 'string', description: 'Recipient name' },
            recipientEmail: { type: 'string', format: 'email', description: 'Recipient email (defaults to the customer\'s)' },
            message: { type: 'string', description: 'Message sent with the invoice' },
            emailSendOption: {
              type: 'string',
              enum: EmailSendOptionEnum.options,
              description: 'Email as a link or an attachment (default auto: customer/company setting)',
            },
            mergeInvoiceAndAttachments: {
              type: 'boolean',
              description: 'With emailSendOption=attachment, merge invoice and attachments into one PDF (default false)',
            },
            organizationNumber: { type: 'string', description: 'Recipient organization number for EHF (defaults to the customer\'s)' },
            mobileNumber: { type: 'string', description: 'Recipient mobile number for SMS (defaults to the customer\'s)' },
          },
          required: ['invoiceId', 'method'],
          additionalProperties: false,
        },
      },
      required: ['sendRequest'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const slug = context.resolveCompanySlug(args.companySlug);
      const sendRequest = SendInvoiceRequestSchema.parse(args.sendRequest, { path: ['sendRequest'] });

      await context.invoices.sendInvoice(slug, sendRequest);
      return jsonResult({ message: 'Invoice sent', invoiceId: sendRequest.invoiceId, method: sendRequest.method });
    },
  },
  {
    name: 'fiken_get_invoice_drafts',
    description: 'List invoice drafts. Returns {pagination, drafts}; each draft is a compact summary (draftId, ' +
      `type, customer, net/gross) unless detail="full". ${CENTS_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        detail,
        params: {
          type: 'object',
          properties: {
            ...pagination,
            orderReference: { type: 'string', description: 'Filter by order reference' },
            uuid: { type: 'string', format: 'uuid', description: 'Filter by draft UUID' },
          },
          additionalProperties: false,
        },
      },
      required: [],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const slug = context.resolveCompanySlug(args.companySlug);
      const level = DetailEnum.default('summary').parse(args.detail, { path: ['detail'] });
      const params = InvoiceDraftQueryParamsSchema.optional().parse(args.params, { path: ['params'] });

      const result = await context.invoices.getInvoiceDrafts(slug, params);
      return listResult('drafts', result, level === 'full' ? undefined : toInvoiceDraftSummary);
    },
  },
  {
    name: 'fiken_create_invoice_draft',
    description: 'Create an editable invoice draft; nothing is booked until it becomes an invoice. ' +
      `${CENTS_NOTE} Returns {message, id, location}; id is the new draftId.`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        draft: draftRequest,
      },
      required: ['draft'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const slug = context.resolveCompanySlug(args.companySlug);
      const draft = InvoiceDraftRequestSchema.parse(args.draft, { path: ['draft'] });

      return createdResult('Invoice draft created', await context.invoices.createInvoiceDraft(slug, draft));
    },
  },
  {
    name: 'fiken_get_invoice_draft',
    description: `Get one invoice draft by draftId: Fiken's full record with lines, customers and attachments. ${CENTS_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        draftId: { type: 'integer', description: 'Invoice draft ID' },
      },
      required: ['draftId'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const slug = context.resolveCompanySlug(args.companySlug);
      const draftId = IdSchema.parse(args.draftId, { path: ['draftId'] });

      const result = await context.invoices.getInvoiceDraft(slug, draftId);
      return jsonResult(result.data);
    },
  },
  {
    name: 'fiken_update_invoice_draft',
    description: 'Replace an invoice draft: fields left out are cleared, so start from fiken_get_invoice_draft ' +
      `(customerId is customers[0].contactId there). ${CENTS_NOTE} Returns {message, id, location}; id is the draftId.`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        draftId: { type: 'integer', description: 'Invoice draft ID' },
        draft: draftRequest,
      },
      required: ['draftId', 'draft'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const slug = context.resolveCompanySlug(args.companySlug);
      const draftId = IdSchema.parse(args.draftId, { path: ['draftId'] });
      const draft = InvoiceDraftRequestSchema.parse(args.draft, { path: ['draft'] });

      return createdResult('Invoice draft updated', await context.invoices.updateInvoiceDraft(slug, draftId, draft));
    },
  },
  {
    name: 'fiken_create_invoice_from_draft',
    description: 'Turn an invoice draft into a booked invoice. Returns {message, id, location}; id is the new ' +
      'invoiceId, which fiken_send_invoice takes.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        draftId: { type: 'integer', description: 'Invoice draft ID' },
      },
      required: ['draftId'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const slug = context.resolveCompanySlug(args.companySlug);
      const draftId = IdSchema.parse(args.draftId, { path: ['draftId'] });

      return createdResult('Invoice created from draft', await context.invoices.createInvoiceFromDraft(slug, draftId));
    },
  },
  {
    name: 'fiken_get_invoice_counter',
    description: 'Get the invoice number counter: {value}, the last used invoice number. Fiken needs a counter ' +
      'before the first invoice; create one with fiken_create_invoice_counter.',
    inputSchema: {
      type: 'object',
      properties: { companySlug },
      required: [],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const slug = context.resolveCompanySlug(args.companySlug);

      const result = await context.invoices.getInvoiceCounter(slug);
      return jsonResult(result.data);
    },
  },
  {
    name: 'fiken_create_invoice_counter',
    description: 'Create the invoice number counter, needed once before the first invoice. Each invoice gets the ' +
      'next number, so the default value 10000 makes the first invoice 10001. Returns {message, value}.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        counter: {
          type: 'object',
          properties: {
            value: { type: 'integer', description: 'Starting value (default 10000)' },
          },
          additionalProperties: false,
        },
      },
      required: [],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const slug = context.resolveCompanySlug(args.companySlug);
      const counter = CounterSchema.optional().parse(args.counter, { path: ['counter'] });

      await context.invoices.createInvoiceCounter(slug, counter);
      // Fiken answers 201 with no body or Location; 10000 is its documented default
      return jsonResult({ message: 'Invoice counter created', value: counter?.value ?? 10000 });
    },
  },
  {
    name: 'fiken_get_invoice_attachments',
    description: 'List the files attached to an invoice. Returns {attachments}, each with filename, type and ' +
      'downloadUrl (fetch it with the API token).',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        invoiceId: { type: 'integer', description: 'Invoice ID' },
      },
      required: ['invoiceId'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const slug = context.resolveCompanySlug(args.companySlug);
      const invoiceId = IdSchema.parse(args.invoiceId, { path: ['invoiceId'] });

      return listResult('attachments', await context.invoices.getInvoiceAttachments(slug, invoiceId));
    },
  },
  {
    name: 'fiken_get_invoice_draft_attachments',
    description: 'List the files attached to an invoice draft. Returns {attachments}, each with filename, type and ' +
      'downloadUrl (fetch it with the API token).',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug,
        draftId: { type: 'integer', description: 'Invoice draft ID' },
      },
      required: ['draftId'],
    },
    handler: async (args, context) => {
      context.ensureConfigured();
      const slug = context.resolveCompanySlug(args.companySlug);
      const draftId = IdSchema.parse(args.draftId, { path: ['draftId'] });

      return listResult('attachments', await context.invoices.getInvoiceDraftAttachments(slug, draftId));
    },
  },
];
