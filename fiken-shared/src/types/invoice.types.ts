/**
 * Fiken invoice and invoice draft types, following the v2 OpenAPI spec (swagger/swagger.yaml).
 * All amounts are integer cents (øre) unless noted otherwise.
 */

import { OrderLine, Payment } from './shared.types';

// VAT types allowed on invoice lines (invoiceLineRequest.vatType)
export type InvoiceVatType =
  | 'HIGH' | 'MEDIUM' | 'LOW' | 'EXEMPT' | 'EXEMPT_IMPORT_EXPORT' | 'EXEMPT_REVERSE' | 'OUTSIDE' | 'NONE';

// VAT types for sales, allowed on invoice draft lines (invoiceishDraftLine.vatType)
export type SalesVatType = InvoiceVatType | 'RAW_FISH';

// Øreavrunding applied to the total; NOK only
export type RoundingType = 'none' | 'round_half' | 'round_whole' | 'round_down_half' | 'round_down_whole';

export type InvoiceDraftType =
  | 'invoice' | 'cash_invoice' | 'offer' | 'order_confirmation' | 'credit_note' | 'repeating_invoice';

export type InvoiceSendMethod = 'email' | 'ehf' | 'efaktura' | 'sms' | 'letter' | 'auto';

export type EmailSendOption = 'document_link' | 'attachment' | 'auto';

export type DispatchType = 'email' | 'sms' | 'ehf' | 'letter' | 'vipps' | 'efaktura' | 'unknown';

// ========== NESTED RESULT TYPES ==========
// The spec's address/attachment/contact/projectResult schemas, which differ from the simplified ones in shared.types

export interface InvoiceAddress {
  streetAddress?: string;
  streetAddressLine2?: string;
  city?: string;
  postCode?: string;
  country: string;
}

export interface InvoiceAttachment {
  uuid?: string;
  filename?: string;
  identifier?: string;
  downloadUrl?: string;
  downloadUrlWithFikenNormalUserCredentials?: string;
  comment?: string;
  type?: 'invoice' | 'reminder' | 'unspecified' | 'ocr' | 'bank_statement';
}

export interface InvoiceContactPerson {
  contactPersonId?: number;
  name: string;
  email: string;
  phoneNumber?: string;
  address?: InvoiceAddress;
}

export interface InvoiceContact {
  contactId?: number;
  createdDate?: string; // format: yyyy-mm-dd
  lastModifiedDate?: string; // format: yyyy-mm-dd
  name: string;
  email?: string;
  organizationNumber?: string;
  customerNumber?: number;
  customerAccountCode?: string;
  supplierNumber?: number;
  supplierAccountCode?: string;
  customer?: boolean;
  supplier?: boolean;
  bankAccountNumber?: string;
  contactPerson?: InvoiceContactPerson[];
  notes?: Array<{ author?: string; note?: string }>;
  language?: string | null;
  inactive?: boolean;
  daysUntilInvoicingDueDate?: number;
  discount?: number; // percentage
  address?: InvoiceAddress;
  groups?: string[];
  documents?: InvoiceAttachment[];
}

export interface InvoiceProject {
  projectId?: number;
  number?: string;
  name?: string;
  description?: string;
  startDate?: string; // format: yyyy-mm-dd
  endDate?: string; // format: yyyy-mm-dd
  contact?: InvoiceContact;
  completed?: boolean;
}

// The spec's saleResult: the ledger entry behind an invoice, which carries its payment status
export interface InvoiceSale {
  saleId?: number;
  lastModifiedDate?: string; // format: yyyy-mm-dd
  transactionId?: number;
  saleNumber?: string;
  date?: string; // format: yyyy-mm-dd
  kind?: 'cash_sale' | 'invoice' | 'external_invoice';
  netAmount?: number; // in cents
  vatAmount?: number; // in cents
  settled?: boolean;
  settledDate?: string; // format: yyyy-mm-dd
  writeOff?: boolean;
  totalPaid?: number; // in NOK cents
  totalPaidInCurrency?: number; // in cents
  outstandingBalance?: number; // in cents
  outstandingBalanceInCurrency?: number; // in cents
  lines?: OrderLine[];
  customer?: InvoiceContact;
  currency?: string; // ISO 4217 currency code
  dueDate?: string; // format: yyyy-mm-dd
  kid?: string;
  salePayments?: Payment[];
  saleAttachments?: InvoiceAttachment[];
  paymentDate?: string; // format: yyyy-mm-dd
  project?: InvoiceProject;
  notes?: Array<{ author?: string; note?: string }>;
  deleted?: boolean;
}

export interface InvoiceDispatch {
  date?: string; // format: yyyy-mm-dd
  dispatchType?: DispatchType;
}

// ========== INVOICES ==========

export interface InvoiceLineRequest {
  net?: number; // in cents, original currency
  vat?: number; // in cents, original currency
  vatType?: InvoiceVatType;
  gross?: number; // in cents
  vatInPercent?: number; // 0-100
  unitPrice?: number; // in cents, invoice currency; overrides the product's price
  quantity: number;
  discount?: number; // percentage 0-100
  productName?: string; // only when productId is not provided
  productId?: number;
  description?: string; // max 200 chars
  comment?: string; // max 200 chars
  incomeAccount?: string;
}

export interface InvoiceLineResult {
  net?: number; // in cents, original currency
  vat?: number; // in cents, original currency
  vatType?: string;
  gross?: number; // in cents
  netInNok?: number; // in cents
  vatInNok?: number; // in cents
  grossInNok?: number; // in cents
  vatInPercent?: number;
  unitPrice?: number; // in cents
  quantity?: number;
  discount?: number;
  productId?: number;
  productName?: string;
  description?: string;
  comment?: string;
  incomeAccount?: string;
}

export interface InvoiceRequest {
  uuid?: string; // generated by Fiken if omitted
  issueDate: string; // format: yyyy-mm-dd
  dueDate: string; // format: yyyy-mm-dd
  lines: InvoiceLineRequest[]; // at least one
  ourReference?: string;
  yourReference?: string;
  orderReference?: string;
  customerId: number; // contactId of a contact with customer = true
  contactPersonId?: number;
  bankAccountCode: string; // format: 1920:XXXXX
  currency?: string; // ISO 4217 currency code, defaults to NOK
  invoiceText?: string; // max 500 chars
  cash: boolean;
  paymentAccount?: string; // cash invoices only, e.g. 1920:10001
  projectId?: number;
  roundingType?: RoundingType;
}

export interface InvoiceResult {
  invoiceId?: number;
  createdDate?: string; // format: yyyy-mm-dd
  lastModifiedDate?: string; // format: yyyy-mm-dd
  invoiceNumber?: number;
  kid?: string;
  issueDate?: string; // format: yyyy-mm-dd
  dueDate?: string; // format: yyyy-mm-dd
  originalDueDate?: string; // format: yyyy-mm-dd
  net?: number; // in cents, invoice currency
  vat?: number; // in cents, invoice currency
  gross?: number; // in cents, invoice currency
  netInNok?: number; // in cents
  vatInNok?: number; // in cents
  grossInNok?: number; // in cents
  cash?: boolean;
  invoiceText?: string;
  yourReference?: string;
  ourReference?: string;
  orderReference?: string;
  invoiceDraftUuid?: string;
  recurringInvoiceId?: number;
  recurringInvoiceJobId?: number;
  address?: InvoiceAddress;
  lines?: InvoiceLineResult[];
  currency?: string; // ISO 4217 currency code, defaults to NOK
  bankAccountNumber?: string;
  sentManually?: boolean;
  invoicePdf?: InvoiceAttachment;
  associatedCreditNotes?: number[];
  attachments?: InvoiceAttachment[];
  customer?: InvoiceContact;
  sale?: InvoiceSale;
  project?: InvoiceProject;
  dispatches?: InvoiceDispatch[];
}

export interface UpdateInvoiceRequest {
  newDueDate?: string; // format: yyyy-mm-dd
  sentManually?: boolean;
}

export interface SendInvoiceRequest {
  invoiceId: number;
  method: InvoiceSendMethod[]; // in priority order; Fiken uses the first that succeeds
  includeDocumentAttachments: boolean;
  recipientName?: string;
  recipientEmail?: string;
  message?: string;
  emailSendOption?: EmailSendOption;
  mergeInvoiceAndAttachments?: boolean;
  organizationNumber?: string;
  mobileNumber?: string;
}

export interface InvoiceQueryParams {
  page?: number;
  pageSize?: number;
  issueDate?: string; // format: yyyy-mm-dd
  issueDateLe?: string; // format: yyyy-mm-dd
  issueDateLt?: string; // format: yyyy-mm-dd
  issueDateGe?: string; // format: yyyy-mm-dd
  issueDateGt?: string; // format: yyyy-mm-dd
  lastModified?: string; // format: yyyy-mm-dd
  lastModifiedLe?: string; // format: yyyy-mm-dd
  lastModifiedLt?: string; // format: yyyy-mm-dd
  lastModifiedGe?: string; // format: yyyy-mm-dd
  lastModifiedGt?: string; // format: yyyy-mm-dd
  dueDate?: string; // format: yyyy-mm-dd
  dueDateLe?: string; // format: yyyy-mm-dd
  dueDateLt?: string; // format: yyyy-mm-dd
  dueDateGe?: string; // format: yyyy-mm-dd
  dueDateGt?: string; // format: yyyy-mm-dd
  customerId?: number;
  settled?: boolean;
  orderReference?: string;
  invoiceDraftUuid?: string;
  invoiceNumber?: string;
}

// ========== INVOICE DRAFTS ==========

export interface InvoiceFrequency {
  interval: number; // at least 1
  intervalUnit: 'DAY' | 'WEEK' | 'MONTH';
}

// The spec's invoiceishDraftLine; invoiceishDraftLineId and lastModifiedDate are read-only
export interface InvoiceDraftLine {
  invoiceishDraftLineId?: number;
  lastModifiedDate?: string; // format: yyyy-mm-dd
  productId?: number;
  description?: string; // max 200 chars
  unitPrice?: number; // in cents, invoice currency
  vatType?: SalesVatType;
  quantity: number;
  discount?: number; // percentage 0-100
  comment?: string; // max 200 chars
  incomeAccount?: string;
}

// The spec's invoiceishDraftRequest
export interface InvoiceDraftRequest {
  type: InvoiceDraftType;
  uuid?: string;
  issueDate?: string; // format: yyyy-mm-dd
  daysUntilDueDate: number;
  invoiceText?: string;
  yourReference?: string;
  ourReference?: string;
  orderReference?: string;
  lines?: InvoiceDraftLine[];
  currency?: string; // ISO 4217 currency code
  bankAccountNumber?: string;
  iban?: string;
  bic?: string;
  paymentAccount?: string;
  customerId: number; // contactId of a contact with customer = true
  contactPersonId?: number;
  projectId?: number;
  roundingType?: RoundingType;
  startDate?: string; // format: yyyy-mm-dd, required when type is repeating_invoice
  endDate?: string; // format: yyyy-mm-dd, repeating_invoice only
  frequency?: InvoiceFrequency;
}

// The spec's invoiceishDraftResult
export interface InvoiceDraftResult {
  draftId?: number;
  uuid?: string;
  type?: InvoiceDraftType;
  lastModifiedDate?: string; // format: yyyy-mm-dd
  issueDate?: string; // format: yyyy-mm-dd
  daysUntilDueDate?: number;
  invoiceText?: string;
  currency?: string; // ISO 4217 currency code
  yourReference?: string;
  ourReference?: string;
  orderReference?: string;
  lines?: InvoiceDraftLine[];
  net?: number; // in cents, invoice currency
  gross?: number; // in cents, invoice currency
  bankAccountNumber?: string;
  iban?: string;
  bic?: string;
  paymentAccount?: string;
  customers?: InvoiceContact[];
  attachments?: InvoiceAttachment[];
  createdFromInvoiceId?: number;
  projectId?: number;
  roundingType?: RoundingType;
  startDate?: string; // format: yyyy-mm-dd
  endDate?: string; // format: yyyy-mm-dd
  frequency?: InvoiceFrequency;
}

export interface InvoiceDraftQueryParams {
  page?: number;
  pageSize?: number;
  orderReference?: string;
  uuid?: string;
}
