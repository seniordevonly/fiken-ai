/**
 * Tools for contacts (customers and suppliers), their contact persons and attachments, contact groups and products.
 */

import { FikenContactService } from 'fiken-shared';
import { z } from 'zod';
import type { FikenContext } from '../context.js';
import { IdSchema } from '../schemas.js';
import { createdResult, jsonResult, listResult, type ToolDefinition } from './types.js';

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');
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

const ContactQueryParamsSchema = z.object({
  ...PageSchema,
  ...dateFilters('lastModified'),
  ...dateFilters('createdDate'),
  supplierNumber: z.number().int().optional(),
  customerNumber: z.number().int().optional(),
  memberNumberString: z.string().optional(),
  name: z.string().optional(),
  organizationNumber: z.string().optional(),
  email: z.string().optional(),
  customer: z.boolean().optional(),
  supplier: z.boolean().optional(),
  inactive: z.boolean().optional(),
  group: z.string().optional(),
  sortBy: z.enum(['lastModified asc', 'lastModified desc', 'createdDate asc', 'createdDate desc']).optional(),
  phoneNumber: z.string().optional(),
});

const AddressSchema = z.object({
  streetAddress: z.string().optional(),
  streetAddressLine2: z.string().optional(),
  city: z.string().optional(),
  postCode: z.string().optional(),
  country: z.string().min(1),
});

const ContactPersonSchema = z.object({
  name: z.string().min(1),
  email: z.string().min(1),
  phoneNumber: z.string().optional(),
  address: AddressSchema.optional(),
});

const ContactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().max(200).optional(),
  organizationNumber: z.string().max(200).optional(),
  phoneNumber: z.string().max(20).optional(),
  memberNumberString: z.string().optional(),
  customer: z.boolean().optional(),
  supplier: z.boolean().optional(),
  bankAccountNumber: z.string().max(11).optional(),
  contactPerson: z.array(ContactPersonSchema).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code').optional(),
  language: z.string().optional(),
  inactive: z.boolean().optional(),
  daysUntilInvoicingDueDate: z.number().int().optional(),
  discount: z.number().min(0).max(100).optional(),
  address: AddressSchema.optional(),
  groups: z.array(z.string()).optional(),
});

const ProductVatTypeEnum = z.enum(['HIGH', 'MEDIUM', 'LOW', 'EXEMPT', 'EXEMPT_IMPORT_EXPORT', 'EXEMPT_REVERSE', 'OUTSIDE', 'NONE']);

const ProductSchema = z.object({
  name: z.string().min(1),
  unitPrice: z.number().int().optional(),
  incomeAccount: z.string().min(1),
  vatType: ProductVatTypeEnum,
  active: z.boolean(),
  productNumber: z.string().optional(),
  stock: z.number().optional(),
  note: z.string().max(200).optional(),
});

const ProductQueryParamsSchema = z.object({
  ...PageSchema,
  ...dateFilters('createdDate'),
  ...dateFilters('lastModified'),
  name: z.string().optional(),
  productNumber: z.string().optional(),
  active: z.boolean().optional(),
});

const companySlug = z.string().optional();

/**
 * Each tool's arguments; handlers parse with these, so errors name the field (e.g. "params.pageSize: ..."), and the
 * tests check them against the advertised inputSchema
 */
export const contactToolArgs = {
  fiken_get_contacts: z.object({ companySlug, detail: DetailSchema, params: ContactQueryParamsSchema.optional() }),
  fiken_get_contact: z.object({ companySlug, contactId: IdSchema }),
  fiken_create_contact: z.object({ companySlug, contact: ContactSchema }),
  fiken_update_contact: z.object({ companySlug, contactId: IdSchema, contact: ContactSchema }),
  fiken_get_contact_attachments: z.object({ companySlug, contactId: IdSchema }),
  fiken_get_contact_persons: z.object({ companySlug, contactId: IdSchema }),
  fiken_get_contact_person: z.object({ companySlug, contactId: IdSchema, contactPersonId: IdSchema }),
  fiken_create_contact_person: z.object({ companySlug, contactId: IdSchema, contactPerson: ContactPersonSchema }),
  fiken_update_contact_person: z.object({
    companySlug,
    contactId: IdSchema,
    contactPersonId: IdSchema,
    contactPerson: ContactPersonSchema,
  }),
  fiken_get_contact_groups: z.object({ companySlug, params: z.object(PageSchema).optional() }),
  fiken_get_products: z.object({ companySlug, detail: DetailSchema, params: ProductQueryParamsSchema.optional() }),
  fiken_get_product: z.object({ companySlug, productId: IdSchema }),
  fiken_create_product: z.object({ companySlug, product: ProductSchema }),
  fiken_update_product: z.object({ companySlug, productId: IdSchema, product: ProductSchema }),
  fiken_get_product_sales_report: z.object({ companySlug, from: DateSchema, to: DateSchema }),
};

// The fields needed to pick a contact as supplierId/customerId or answer "who is X"
const toContactSummary = (contact: any) => ({
  contactId: contact.contactId,
  name: contact.name,
  organizationNumber: contact.organizationNumber,
  email: contact.email,
  customerNumber: contact.customerNumber,
  supplierNumber: contact.supplierNumber,
  inactive: contact.inactive,
});

const toProductSummary = (product: any) => ({
  productId: product.productId,
  name: product.name,
  productNumber: product.productNumber,
  unitPrice: product.unitPrice,
  vatType: product.vatType,
  incomeAccount: product.incomeAccount,
  active: product.active,
});

// ---------- JSON schemas advertised to clients (keep in sync with the zod schemas above) ----------

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

const addressProperty = {
  type: 'object',
  properties: {
    streetAddress: { type: 'string' },
    streetAddressLine2: { type: 'string' },
    city: { type: 'string' },
    postCode: { type: 'string' },
    country: { type: 'string', description: 'Country name, e.g. Norway' },
  },
  required: ['country'],
};

const contactPersonProperty = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    email: { type: 'string' },
    phoneNumber: { type: 'string' },
    address: addressProperty,
  },
  required: ['name', 'email'],
};

const contactProperty = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Contact name (1-200 chars)' },
    email: { type: 'string', description: 'Email address (max 200 chars)' },
    organizationNumber: { type: 'string', description: 'Norwegian organization number (Brreg)' },
    phoneNumber: { type: 'string', description: 'Phone number (max 20 chars)' },
    memberNumberString: { type: 'string', description: 'Your own id for this contact' },
    customer: { type: 'boolean', description: 'True if the contact is a customer (can also be a supplier)' },
    supplier: { type: 'boolean', description: 'True if the contact is a supplier (can also be a customer)' },
    bankAccountNumber: { type: 'string', description: 'Bank account number (11 digits)' },
    contactPerson: { type: 'array', items: contactPersonProperty, description: 'Contact persons' },
    currency: { type: 'string', description: 'Default invoice currency, 3-letter ISO code (e.g. EUR)' },
    language: { type: 'string', description: 'Language for documents sent to the contact: NORWEGIAN (default) or ENGLISH' },
    inactive: { type: 'boolean', description: 'True to deactivate the contact' },
    daysUntilInvoicingDueDate: { type: 'number', description: 'Default days until invoice due date' },
    discount: { type: 'number', description: 'Default discount percent (0-100, decimals allowed)' },
    address: addressProperty,
    groups: { type: 'array', items: { type: 'string' }, description: 'Customer group names' },
  },
  required: ['name'],
};

const productProperty = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Product name' },
    unitPrice: { type: 'number', description: 'Net unit price excluding VAT, in cents (øre)' },
    incomeAccount: { type: 'string', description: 'Income account code, e.g. 3000' },
    vatType: { type: 'string', enum: ProductVatTypeEnum.options, description: 'VAT type; HIGH is the most common' },
    active: { type: 'boolean', description: 'Whether the product is in use' },
    productNumber: { type: 'string', description: 'Product number (varenummer)' },
    stock: { type: 'number', description: 'Units in stock (decimals allowed)' },
    note: { type: 'string', description: 'Note (max 200 chars)' },
  },
  required: ['name', 'incomeAccount', 'vatType', 'active'],
};

const contactService = (context: FikenContext) => context.client(FikenContactService);

export const contactTools: ToolDefinition[] = [
  // ---------- contacts ----------
  {
    name: 'fiken_get_contacts',
    description: 'Find contacts (customers and suppliers); filters are exact matches. Returns a compact summary per ' +
      'contact (contactId, name, organizationNumber, email, customerNumber, supplierNumber, inactive) plus pagination; ' +
      'use contactId as supplierId on purchases or customerId on invoices.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        detail: detailProperty('compact fields per contact'),
        params: {
          type: 'object',
          properties: {
            ...pageProperties,
            name: { type: 'string', description: 'Exact contact name' },
            organizationNumber: { type: 'string', description: 'Exact organization number, e.g. 913312465' },
            email: { type: 'string', description: 'Exact email address' },
            phoneNumber: { type: 'string', description: 'Exact phone number' },
            supplier: { type: 'boolean', description: 'true: suppliers only (with customer=true: contacts that are both)' },
            customer: { type: 'boolean', description: 'true: customers only (with supplier=true: contacts that are both)' },
            inactive: { type: 'boolean', description: 'false: active contacts only; true: inactive only' },
            supplierNumber: { type: 'number', description: 'Supplier number' },
            customerNumber: { type: 'number', description: 'Customer number' },
            memberNumberString: { type: 'string', description: 'Your own id for the contact (member number)' },
            group: { type: 'string', description: 'Exact customer group name (see fiken_get_contact_groups)' },
            ...dateFilterProperties('lastModified', 'last modified date'),
            ...dateFilterProperties('createdDate', 'created date'),
            sortBy: {
              type: 'string',
              enum: ['lastModified asc', 'lastModified desc', 'createdDate asc', 'createdDate desc'],
              description: 'Sort order (default createdDate asc)',
            },
          },
        },
      },
      required: [],
    },
    handler: async (args, context) => {
      const { detail, params } = contactToolArgs.fiken_get_contacts.parse(args);
      const response = await contactService(context).getContacts(context.resolveCompanySlug(args.companySlug), params);
      return listResult('contacts', response, detail === 'full' ? undefined : toContactSummary);
    },
  },
  {
    name: 'fiken_get_contact',
    description: 'Get one contact by contactId, with its contact persons, notes, address, account codes and documents.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        contactId: idProperty('Contact ID (from fiken_get_contacts)'),
      },
      required: ['contactId'],
    },
    handler: async (args, context) => {
      const { contactId } = contactToolArgs.fiken_get_contact.parse(args);
      const response = await contactService(context).getContact(context.resolveCompanySlug(args.companySlug), contactId);
      return jsonResult(response.data);
    },
  },
  {
    name: 'fiken_create_contact',
    description: 'Create a contact; set customer and/or supplier to true. Returns the new contactId; check ' +
      'fiken_get_contacts (e.g. by organizationNumber) first to avoid duplicates.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        contact: contactProperty,
      },
      required: ['contact'],
    },
    handler: async (args, context) => {
      const { contact } = contactToolArgs.fiken_create_contact.parse(args);
      const response = await contactService(context).createContact(context.resolveCompanySlug(args.companySlug), contact);
      return createdResult('Contact created', response);
    },
  },
  {
    name: 'fiken_update_contact',
    description: 'Replace a contact\'s details: send every field to keep, not just the changes (start from ' +
      'fiken_get_contact). Returns the contactId.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        contactId: idProperty('Contact ID'),
        contact: contactProperty,
      },
      required: ['contactId', 'contact'],
    },
    handler: async (args, context) => {
      const { contactId, contact } = contactToolArgs.fiken_update_contact.parse(args);
      const response = await contactService(context)
        .updateContact(context.resolveCompanySlug(args.companySlug), contactId, contact);
      return createdResult('Contact updated', response);
    },
  },
  {
    name: 'fiken_get_contact_attachments',
    description: 'List the documents attached to a contact, with download URLs.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        contactId: idProperty('Contact ID'),
      },
      required: ['contactId'],
    },
    handler: async (args, context) => {
      const { contactId } = contactToolArgs.fiken_get_contact_attachments.parse(args);
      const response = await contactService(context)
        .getContactAttachments(context.resolveCompanySlug(args.companySlug), contactId);
      return jsonResult(response.data);
    },
  },

  // ---------- contact persons ----------
  {
    name: 'fiken_get_contact_persons',
    description: 'List the contact persons of a contact (contactPersonId, name, email, phoneNumber, address).',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        contactId: idProperty('Contact ID'),
      },
      required: ['contactId'],
    },
    handler: async (args, context) => {
      const { contactId } = contactToolArgs.fiken_get_contact_persons.parse(args);
      const response = await contactService(context)
        .getContactPersons(context.resolveCompanySlug(args.companySlug), contactId);
      return jsonResult(response.data);
    },
  },
  {
    name: 'fiken_get_contact_person',
    description: 'Get one contact person of a contact.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        contactId: idProperty('Contact ID'),
        contactPersonId: idProperty('Contact person ID (from fiken_get_contact_persons)'),
      },
      required: ['contactId', 'contactPersonId'],
    },
    handler: async (args, context) => {
      const { contactId, contactPersonId } = contactToolArgs.fiken_get_contact_person.parse(args);
      const response = await contactService(context)
        .getContactPerson(context.resolveCompanySlug(args.companySlug), contactId, contactPersonId);
      return jsonResult(response.data);
    },
  },
  {
    name: 'fiken_create_contact_person',
    description: 'Add a contact person (name and email required) to a contact. Returns the new contactPersonId.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        contactId: idProperty('Contact ID'),
        contactPerson: contactPersonProperty,
      },
      required: ['contactId', 'contactPerson'],
    },
    handler: async (args, context) => {
      const { contactId, contactPerson } = contactToolArgs.fiken_create_contact_person.parse(args);
      const response = await contactService(context)
        .createContactPerson(context.resolveCompanySlug(args.companySlug), contactId, contactPerson);
      return createdResult('Contact person created', response);
    },
  },
  {
    name: 'fiken_update_contact_person',
    description: 'Replace a contact person\'s details: send every field to keep, not just the changes.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        contactId: idProperty('Contact ID'),
        contactPersonId: idProperty('Contact person ID'),
        contactPerson: contactPersonProperty,
      },
      required: ['contactId', 'contactPersonId', 'contactPerson'],
    },
    handler: async (args, context) => {
      const { contactId, contactPersonId, contactPerson } = contactToolArgs.fiken_update_contact_person.parse(args);
      const response = await contactService(context).updateContactPerson(
        context.resolveCompanySlug(args.companySlug), contactId, contactPersonId, contactPerson,
      );
      return createdResult('Contact person updated', response);
    },
  },

  // ---------- contact groups ----------
  {
    name: 'fiken_get_contact_groups',
    description: 'List the customer group names, usable as the group filter of fiken_get_contacts.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        params: { type: 'object', properties: pageProperties },
      },
      required: [],
    },
    handler: async (args, context) => {
      const { params } = contactToolArgs.fiken_get_contact_groups.parse(args);
      const response = await contactService(context).getContactGroups(context.resolveCompanySlug(args.companySlug), params);
      return listResult('groups', response);
    },
  },

  // ---------- products ----------
  {
    name: 'fiken_get_products',
    description: 'List products with optional filters. Returns a compact summary per product (productId, name, ' +
      'productNumber, unitPrice in cents (øre) excl. VAT, vatType, incomeAccount, active) plus pagination.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        detail: detailProperty('compact fields per product'),
        params: {
          type: 'object',
          properties: {
            ...pageProperties,
            name: { type: 'string', description: 'Exact product name' },
            productNumber: { type: 'string', description: 'Exact product number (varenummer)' },
            active: { type: 'boolean', description: 'true: active products only; false: inactive only' },
            ...dateFilterProperties('createdDate', 'created date'),
            ...dateFilterProperties('lastModified', 'last modified date'),
          },
        },
      },
      required: [],
    },
    handler: async (args, context) => {
      const { detail, params } = contactToolArgs.fiken_get_products.parse(args);
      const response = await contactService(context).getProducts(context.resolveCompanySlug(args.companySlug), params);
      return listResult('products', response, detail === 'full' ? undefined : toProductSummary);
    },
  },
  {
    name: 'fiken_get_product',
    description: 'Get one product by productId (not productNumber). unitPrice is in cents (øre) excluding VAT.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        productId: idProperty('Product ID (from fiken_get_products)'),
      },
      required: ['productId'],
    },
    handler: async (args, context) => {
      const { productId } = contactToolArgs.fiken_get_product.parse(args);
      const response = await contactService(context).getProduct(context.resolveCompanySlug(args.companySlug), productId);
      return jsonResult(response.data);
    },
  },
  {
    name: 'fiken_create_product',
    description: 'Create a product; unitPrice is in cents (øre) excluding VAT. Returns the new productId.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        product: productProperty,
      },
      required: ['product'],
    },
    handler: async (args, context) => {
      const { product } = contactToolArgs.fiken_create_product.parse(args);
      const response = await contactService(context).createProduct(context.resolveCompanySlug(args.companySlug), product);
      return createdResult('Product created', response);
    },
  },
  {
    name: 'fiken_update_product',
    description: 'Replace a product\'s details: send every field to keep, not just the changes (start from ' +
      'fiken_get_product). unitPrice is in cents (øre) excluding VAT.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        productId: idProperty('Product ID'),
        product: productProperty,
      },
      required: ['productId', 'product'],
    },
    handler: async (args, context) => {
      const { productId, product } = contactToolArgs.fiken_update_product.parse(args);
      const response = await contactService(context)
        .updateProduct(context.resolveCompanySlug(args.companySlug), productId, product);
      return createdResult('Product updated', response);
    },
  },
  {
    name: 'fiken_get_product_sales_report',
    description: 'Sales per product for a date range: units, sales and net/VAT/gross amounts in cents (øre), ' +
      'split into sold, credited and sum.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        from: { type: 'string', description: 'Start date, inclusive (YYYY-MM-DD)' },
        to: { type: 'string', description: 'End date, inclusive (YYYY-MM-DD)' },
      },
      required: ['from', 'to'],
    },
    handler: async (args, context) => {
      const { from, to } = contactToolArgs.fiken_get_product_sales_report.parse(args);
      const response = await contactService(context)
        .getProductSalesReport(context.resolveCompanySlug(args.companySlug), { from, to });
      // The full product record on every row is noise here; identify it and keep the numbers
      const rows = (Array.isArray(response.data) ? response.data : []).map(row => ({
        product: row.product && {
          productId: row.product.productId,
          name: row.product.name,
          productNumber: row.product.productNumber,
        },
        sold: row.sold,
        credited: row.credited,
        sum: row.sum,
      }));
      return jsonResult(rows, { pretty: false, items: rows.length });
    },
  },
];
