/**
 * Fiken Credit notes, offers, order confirmations and recurring invoices types
 */

import { Address, Attachment, Contact, ProjectResult } from './shared.types';

// VAT types valid on sales lines (spec: invoiceishDraftLine.vatType, "Vat Types for SALES")
export type SalesDocumentVatType =
  | 'NONE' | 'HIGH' | 'MEDIUM' | 'RAW_FISH' | 'LOW'
  | 'EXEMPT_IMPORT_EXPORT' | 'EXEMPT' | 'OUTSIDE' | 'EXEMPT_REVERSE';

// Øreavrunding applied to the total; NOK only (spec: roundingType)
export type SalesDocumentRoundingType = 'none' | 'round_half' | 'round_whole' | 'round_down_half' | 'round_down_whole';

// Fiken uses one draft resource (spec: invoiceishDraft*) for every invoice-like document; type says which
export type SalesDocumentDraftType =
  | 'invoice' | 'cash_invoice' | 'offer' | 'order_confirmation' | 'credit_note' | 'repeating_invoice';

// How often a recurring invoice is generated, e.g. { interval: 1, intervalUnit: 'MONTH' } (spec: frequency)
export interface RecurringInvoiceFrequency {
  interval: number; // minimum 1
  intervalUnit: 'DAY' | 'WEEK' | 'MONTH';
}

// Line on a draft or recurring invoice (spec: invoiceishDraftLine)
export interface SalesDocumentDraftLine {
  invoiceishDraftLineId?: number; // read-only
  lastModifiedDate?: string; // read-only, yyyy-mm-dd
  productId?: number;
  description?: string; // maxLength: 200
  unitPrice?: number; // net price per unit in cents, in the document currency
  vatType?: SalesDocumentVatType;
  quantity: number;
  discount?: number; // percent, 0-100
  comment?: string; // maxLength: 200
  incomeAccount?: string; // defaults to the product's income account
}

// Line on an issued credit note, offer or order confirmation (spec: invoiceLineResult)
export interface SalesDocumentLineResult {
  net?: number; // in cents
  vat?: number;
  vatType?: string;
  gross?: number;
  netInNok?: number;
  vatInNok?: number;
  grossInNok?: number;
  vatInPercent?: number;
  unitPrice?: number;
  quantity?: number;
  discount?: number;
  productId?: number;
  productName?: string;
  description?: string;
  comment?: string;
  incomeAccount?: string;
}

// ========== DRAFTS ==========

// Request body for credit note, offer and order confirmation drafts (spec: invoiceishDraftRequest)
export interface SalesDocumentDraftRequest {
  type: SalesDocumentDraftType;
  uuid?: string;
  issueDate?: string; // yyyy-mm-dd
  daysUntilDueDate: number;
  invoiceText?: string;
  yourReference?: string;
  ourReference?: string;
  orderReference?: string; // EHF reference
  lines?: SalesDocumentDraftLine[];
  currency?: string; // ISO 4217
  bankAccountNumber?: string;
  iban?: string;
  bic?: string;
  paymentAccount?: string; // e.g. '1920:10001'
  customerId: number; // contactId of a customer
  contactPersonId?: number; // must belong to the customer
  projectId?: number;
  roundingType?: SalesDocumentRoundingType;
  // repeating_invoice drafts only
  startDate?: string;
  endDate?: string;
  frequency?: RecurringInvoiceFrequency;
}

// Spec: invoiceishDraftResult
export interface SalesDocumentDraftResult {
  draftId?: number;
  uuid?: string;
  type?: SalesDocumentDraftType;
  lastModifiedDate?: string;
  issueDate?: string;
  daysUntilDueDate?: number;
  invoiceText?: string;
  currency?: string;
  yourReference?: string;
  ourReference?: string;
  orderReference?: string;
  lines?: SalesDocumentDraftLine[];
  net?: number; // in cents, in the draft currency
  gross?: number;
  bankAccountNumber?: string;
  iban?: string;
  bic?: string;
  paymentAccount?: string;
  customers?: Contact[];
  attachments?: Attachment[];
  createdFromInvoiceId?: number;
  projectId?: number;
  roundingType?: SalesDocumentRoundingType;
  startDate?: string;
  endDate?: string;
  frequency?: RecurringInvoiceFrequency;
}

// Page/pageSize only; draft lists take no filters
export interface SalesDocumentPageParams {
  page?: number;
  pageSize?: number; // max 100
}

// ========== CREDIT NOTES ==========

export interface CreditNoteQueryParams extends SalesDocumentPageParams {
  issueDate?: string;
  issueDateLe?: string;
  issueDateLt?: string;
  issueDateGe?: string;
  issueDateGt?: string;
  lastModified?: string;
  lastModifiedLe?: string;
  lastModifiedLt?: string;
  lastModifiedGe?: string;
  lastModifiedGt?: string;
  customerId?: number;
  settled?: boolean;
  creditNoteDraftUuid?: string;
}

// Credits the whole invoice (spec: fullCreditNoteRequest)
export interface FullCreditNoteRequest {
  issueDate: string; // yyyy-mm-dd
  invoiceId: number;
  creditNoteText?: string; // maxLength: 500
}

// Spec: creditNoteLineResult, used as the line of a partial credit note request
export interface CreditNoteLine {
  incomeAccount?: string;
  vatType?: SalesDocumentVatType;
  unitPrice: number; // net price per unit in cents
  quantity: number;
  discount?: number; // percent, 0-100
  productId?: number;
  description?: string; // maxLength: 200
  comment?: string; // maxLength: 200
}

// Credits part of an invoice, or nothing in particular when invoiceId is omitted (spec: partialCreditNoteRequest)
export interface PartialCreditNoteRequest {
  ourReference?: string;
  yourReference?: string;
  orderReference?: string;
  project?: number; // project id
  currency?: string;
  issueDate: string; // yyyy-mm-dd
  invoiceId?: number;
  contactId?: number;
  contactPersonId?: number;
  creditNoteText?: string; // maxLength: 500
  lines: CreditNoteLine[];
  roundingType?: SalesDocumentRoundingType;
}

// Spec: creditNoteResult
export interface CreditNoteResult {
  creditNoteId: number;
  creditNoteNumber: number;
  kid?: string;
  customer: Contact;
  net: number; // in cents, in the credit note currency
  vat: number;
  gross: number;
  netInNok: number;
  vatInNok: number;
  grossInNok: number;
  creditNoteText?: string;
  yourReference?: string;
  ourReference?: string;
  orderReference?: string;
  address: Address;
  lines?: SalesDocumentLineResult[];
  currency?: string;
  issueDate?: string;
  lastModifiedDate?: string;
  settled?: boolean;
  associatedInvoiceId?: number;
  creditNoteDraftUuid?: string;
  creditNotePdf?: Attachment;
  project?: ProjectResult;
  sale?: Record<string, unknown>; // spec: saleResult
}

// ========== OFFERS AND ORDER CONFIRMATIONS ==========

// Spec: dispatchResult
export interface SalesDocumentDispatch {
  date?: string;
  dispatchType?: 'email' | 'sms' | 'ehf' | 'letter' | 'vipps' | 'efaktura' | 'unknown';
}

// Spec: offer
export interface Offer {
  offerId?: number;
  offerDraftUuid?: string;
  date?: string;
  offerNumber?: number;
  net?: number; // in cents, in the offer currency
  vat?: number;
  gross?: number;
  comment?: string;
  yourReference?: string;
  ourReference?: string;
  orderReference?: string;
  discount?: number; // amount in the offer currency
  address?: Address;
  lines?: SalesDocumentLineResult[];
  currency?: string;
  contactId?: number;
  contactPersonId?: number;
  projectId?: number;
  archived?: boolean;
  accepted?: string | null; // date accepted; null when not accepted
  dispatches?: SalesDocumentDispatch[];
}

// Spec: orderConfirmation
export interface OrderConfirmation {
  confirmationId?: number;
  confirmationDraftUuid?: string;
  date?: string;
  confirmationNumber?: number;
  net?: number; // in cents, in the order confirmation currency
  vat?: number;
  gross?: number;
  comment?: string;
  yourReference?: string;
  ourReference?: string;
  orderReference?: string;
  discount?: number;
  address?: Address;
  lines?: SalesDocumentLineResult[];
  currency?: string;
  contactId?: number;
  contactPersonId?: number;
  projectId?: number;
  createdInvoice?: number | null; // invoiceId once an invoice was created from it
  archived?: boolean;
  internalComment?: string;
}

// ========== RECURRING INVOICES ==========

export interface RecurringInvoiceQueryParams extends SalesDocumentPageParams {
  customerId?: number;
  active?: boolean;
}

// Spec: recurringInvoiceRecipient. On PUT it replaces the job's delivery configuration entirely
export interface RecurringInvoiceRecipient {
  emails?: string[];
  contactPersonIds?: number[];
  ehf?: boolean;
  efaktura?: boolean;
  letter?: boolean;
  smsPhoneNumber?: string | null;
}

// Spec: recurringInvoiceRequest
export interface RecurringInvoiceRequest {
  uuid?: string;
  customerId: number;
  contactPersonId?: number;
  startDate: string; // first issue date, yyyy-mm-dd
  endDate?: string;
  daysUntilDueDate: number;
  frequency: RecurringInvoiceFrequency;
  currency?: string; // defaults to NOK
  bankAccountNumber: string;
  iban?: string;
  bic?: string;
  invoiceText?: string;
  yourReference?: string;
  ourReference?: string;
  orderReference?: string;
  lines: SalesDocumentDraftLine[];
}

// Spec: recurringInvoiceJobResult; one job per customer
export interface RecurringInvoiceJobResult {
  jobId?: number;
  customerId?: number;
  frequency?: RecurringInvoiceFrequency;
  nextDate?: string;
  endDate?: string;
  active?: boolean; // false when paused
  bankAccountNumber?: string;
  iban?: string;
  bic?: string;
  recipients?: RecurringInvoiceRecipient;
  currency?: string;
  net?: number; // in cents, in the invoice currency
  gross?: number;
  generatedInvoiceIds?: number[];
  lines?: SalesDocumentLineResult[];
}

// Spec: recurringInvoiceResult
export interface RecurringInvoiceResult {
  recurringInvoiceId?: number;
  createdDate?: string;
  description?: string;
  daysUntilDueDate?: number;
  active?: boolean;
  invoiceDraftUuid?: string;
  jobs?: RecurringInvoiceJobResult[];
}

// Spec: addRecurringInvoiceJobRequest
export interface AddRecurringInvoiceJobRequest {
  customerId: number;
  contactPersonIds?: number[];
  nextDate?: string;
}

// Spec: updateRecurringInvoiceLinesRequest; replaces the lines of every job
export interface UpdateRecurringInvoiceLinesRequest {
  lines: SalesDocumentDraftLine[];
  roundingType?: SalesDocumentRoundingType;
}

// Spec: updateRecurringInvoiceFrequencyRequest
export interface UpdateRecurringInvoiceFrequencyRequest {
  description?: string; // maxLength: 250
  frequency: RecurringInvoiceFrequency;
  daysUntilDueDate: number;
}

// Spec: updateRecurringInvoiceJobScheduleRequest. An omitted endDate clears the end date
export interface UpdateRecurringInvoiceJobScheduleRequest {
  nextDate?: string;
  endDate?: string;
}

// Document types that share the drafts/counter endpoint layout; the tool layer folds them into one parameter
export type SalesDocumentType = 'credit_note' | 'offer' | 'order_confirmation';
