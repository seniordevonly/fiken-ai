/**
 * Fiken Invoice Service - Implements invoice APIs from swagger specification
 */

import { FikenBaseService, FikenConfig } from './fiken-base.service';
import {
  InvoiceRequest,
  InvoiceResult,
  InvoiceQueryParams,
  UpdateInvoiceRequest,
  SendInvoiceRequest,
  InvoiceDraftRequest,
  InvoiceDraftResult,
  InvoiceDraftQueryParams,
  InvoiceLineRequest,
  InvoiceDraftLine,
  InvoiceAttachment,
  InvoiceVatType,
  SalesVatType,
  InvoiceDraftType,
  InvoiceSendMethod,
  EmailSendOption,
  RoundingType,
  Counter,
  AttachmentUpload,
  FikenApiResponse
} from '../types/fiken.types';

export class FikenInvoiceService extends FikenBaseService {
  constructor(config: FikenConfig) {
    super(config);
  }

  // ========== INVOICE OPERATIONS ==========

  /**
   * Get all invoices for a company
   * GET /companies/{companySlug}/invoices
   */
  async getInvoices(
    companySlug: string,
    params?: InvoiceQueryParams
  ): Promise<FikenApiResponse<InvoiceResult[]>> {
    this.validateCompanySlug(companySlug);
    
    return this.get<InvoiceResult[]>(`/companies/${companySlug}/invoices`, params);
  }

  /**
   * Create a new invoice
   * POST /companies/{companySlug}/invoices
   * Answers 201 with an empty body; the new invoice's URL is in `location`
   */
  async createInvoice(
    companySlug: string,
    invoice: InvoiceRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateInvoiceRequest(invoice);
    
    return this.post<void>(`/companies/${companySlug}/invoices`, invoice);
  }

  /**
   * Get a specific invoice by ID
   * GET /companies/{companySlug}/invoices/{invoiceId}
   */
  async getInvoice(
    companySlug: string,
    invoiceId: number
  ): Promise<FikenApiResponse<InvoiceResult>> {
    this.validateCompanySlug(companySlug);
    this.validateId(invoiceId, 'invoiceId');
    
    return this.get<InvoiceResult>(`/companies/${companySlug}/invoices/${invoiceId}`);
  }

  /**
   * Update an existing invoice
   * PATCH /companies/{companySlug}/invoices/{invoiceId}
   */
  async updateInvoice(
    companySlug: string,
    invoiceId: number,
    updates: UpdateInvoiceRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(invoiceId, 'invoiceId');
    this.validateUpdateInvoiceRequest(updates);
    
    // The spec documents a 200 with the invoice's URL in Location and no body
    return this.patch<void>(`/companies/${companySlug}/invoices/${invoiceId}`, updates);
  }

  /**
   * Send an invoice
   * POST /companies/{companySlug}/invoices/send
   * Answers 200 with no body
   */
  async sendInvoice(
    companySlug: string,
    sendRequest: SendInvoiceRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateSendInvoiceRequest(sendRequest);
    
    return this.post<void>(`/companies/${companySlug}/invoices/send`, sendRequest);
  }

  // ========== INVOICE ATTACHMENTS ==========

  /**
   * Get all attachments for an invoice
   * GET /companies/{companySlug}/invoices/{invoiceId}/attachments
   */
  async getInvoiceAttachments(
    companySlug: string,
    invoiceId: number
  ): Promise<FikenApiResponse<InvoiceAttachment[]>> {
    this.validateCompanySlug(companySlug);
    this.validateId(invoiceId, 'invoiceId');
    
    return this.get<InvoiceAttachment[]>(`/companies/${companySlug}/invoices/${invoiceId}/attachments`);
  }

  /**
   * Add attachment to an invoice
   * POST /companies/{companySlug}/invoices/{invoiceId}/attachments
   */
  async addInvoiceAttachment(
    companySlug: string,
    invoiceId: number,
    attachment: AttachmentUpload
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(invoiceId, 'invoiceId');
    this.validateAttachment(attachment);
    
    return this.postMultipart<void>(
      `/companies/${companySlug}/invoices/${invoiceId}/attachments`,
      attachment
    );
  }

  // ========== INVOICE COUNTER ==========

  /**
   * Get invoice counter
   * GET /companies/{companySlug}/invoices/counter
   */
  async getInvoiceCounter(
    companySlug: string
  ): Promise<FikenApiResponse<Counter>> {
    this.validateCompanySlug(companySlug);
    
    return this.get<Counter>(`/companies/${companySlug}/invoices/counter`);
  }

  /**
   * Create invoice counter
   * POST /companies/{companySlug}/invoices/counter
   */
  async createInvoiceCounter(
    companySlug: string,
    counter?: Counter
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    if (counter?.value !== undefined && !Number.isInteger(counter.value)) {
      throw new Error('Counter value must be an integer');
    }
    
    // An empty body makes Fiken start at 10000, so the first invoice number is 10001
    return this.post<void>(`/companies/${companySlug}/invoices/counter`, counter || {});
  }

  // ========== INVOICE DRAFTS ==========

  /**
   * Get all invoice drafts for a company
   * GET /companies/{companySlug}/invoices/drafts
   */
  async getInvoiceDrafts(
    companySlug: string,
    params?: InvoiceDraftQueryParams
  ): Promise<FikenApiResponse<InvoiceDraftResult[]>> {
    this.validateCompanySlug(companySlug);
    
    return this.get<InvoiceDraftResult[]>(`/companies/${companySlug}/invoices/drafts`, params);
  }

  /**
   * Create a new invoice draft
   * POST /companies/{companySlug}/invoices/drafts
   * Answers 201 with an empty body; the new draft's URL is in `location`
   */
  async createInvoiceDraft(
    companySlug: string,
    draft: InvoiceDraftRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateInvoiceDraftRequest(draft);
    
    return this.post<void>(`/companies/${companySlug}/invoices/drafts`, draft);
  }

  /**
   * Get a specific invoice draft by ID
   * GET /companies/{companySlug}/invoices/drafts/{draftId}
   */
  async getInvoiceDraft(
    companySlug: string,
    draftId: number
  ): Promise<FikenApiResponse<InvoiceDraftResult>> {
    this.validateCompanySlug(companySlug);
    this.validateId(draftId, 'draftId');
    
    return this.get<InvoiceDraftResult>(`/companies/${companySlug}/invoices/drafts/${draftId}`);
  }

  /**
   * Update an existing invoice draft
   * PUT /companies/{companySlug}/invoices/drafts/{draftId}
   */
  async updateInvoiceDraft(
    companySlug: string,
    draftId: number,
    draft: InvoiceDraftRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(draftId, 'draftId');
    this.validateInvoiceDraftRequest(draft);
    
    return this.put<void>(`/companies/${companySlug}/invoices/drafts/${draftId}`, draft);
  }

  /**
   * Delete an invoice draft
   * DELETE /companies/{companySlug}/invoices/drafts/{draftId}
   */
  async deleteInvoiceDraft(
    companySlug: string,
    draftId: number
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(draftId, 'draftId');
    
    return this.delete<void>(`/companies/${companySlug}/invoices/drafts/${draftId}`);
  }

  /**
   * Create an invoice from an invoice draft
   * POST /companies/{companySlug}/invoices/drafts/{draftId}/createInvoice
   * Answers 201 with an empty body; the new invoice's URL is in `location`
   */
  async createInvoiceFromDraft(
    companySlug: string,
    draftId: number
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(draftId, 'draftId');

    return this.post<void>(`/companies/${companySlug}/invoices/drafts/${draftId}/createInvoice`);
  }

  /**
   * Activate a recurring invoice from a draft of type repeating_invoice
   * POST /companies/{companySlug}/invoices/drafts/{draftId}/createRecurringInvoice
   * Answers 201 with an empty body; the new recurring invoice's URL is in `location`
   */
  async createRecurringInvoiceFromDraft(
    companySlug: string,
    draftId: number
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(draftId, 'draftId');

    return this.post<void>(`/companies/${companySlug}/invoices/drafts/${draftId}/createRecurringInvoice`);
  }

  // ========== INVOICE DRAFT ATTACHMENTS ==========

  /**
   * Get all attachments for an invoice draft
   * GET /companies/{companySlug}/invoices/drafts/{draftId}/attachments
   */
  async getInvoiceDraftAttachments(
    companySlug: string,
    draftId: number
  ): Promise<FikenApiResponse<InvoiceAttachment[]>> {
    this.validateCompanySlug(companySlug);
    this.validateId(draftId, 'draftId');
    
    return this.get<InvoiceAttachment[]>(`/companies/${companySlug}/invoices/drafts/${draftId}/attachments`);
  }

  /**
   * Add attachment to an invoice draft
   * POST /companies/{companySlug}/invoices/drafts/{draftId}/attachments
   */
  async addInvoiceDraftAttachment(
    companySlug: string,
    draftId: number,
    attachment: AttachmentUpload
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(draftId, 'draftId');
    this.validateAttachment(attachment);
    
    return this.postMultipart<void>(
      `/companies/${companySlug}/invoices/drafts/${draftId}/attachments`,
      attachment
    );
  }


  // ========== VALIDATION METHODS ==========
  // Mirror the spec's required fields and formats so obvious mistakes fail fast with a clear message;
  // Fiken still enforces business rules (e.g. a free-text line needs a price and VAT)

  private validateInvoiceRequest(invoice: InvoiceRequest): void {
    if (!invoice || typeof invoice !== 'object') {
      throw new Error('Invoice is required');
    }

    this.validateDate(invoice.issueDate, 'issueDate', true);
    this.validateDate(invoice.dueDate, 'dueDate', true);
    this.validateId(invoice.customerId, 'customerId');
    if (invoice.contactPersonId !== undefined) this.validateId(invoice.contactPersonId, 'contactPersonId');
    if (invoice.projectId !== undefined) this.validateId(invoice.projectId, 'projectId');

    if (!invoice.bankAccountCode) {
      throw new Error('bankAccountCode is required (format 1920:XXXXX)');
    }
    if (typeof invoice.cash !== 'boolean') {
      throw new Error('cash is required and must be a boolean');
    }
    this.validateCurrency(invoice.currency);
    this.validateMaxLength(invoice.invoiceText, 500, 'invoiceText');
    this.validateRoundingType(invoice.roundingType);

    if (!Array.isArray(invoice.lines) || invoice.lines.length === 0) {
      throw new Error('Invoice must have at least one line');
    }
    invoice.lines.forEach((line, index) => this.validateInvoiceLine(line, index));
  }

  private validateInvoiceLine(line: InvoiceLineRequest, index: number): void {
    const name = `Invoice line ${index + 1}`;
    this.validateLineCommon(line, name);
    for (const field of ['net', 'vat', 'gross', 'unitPrice'] as const) {
      this.validateCents(line[field], `${name} ${field}`);
    }
    if (line.vatType !== undefined && !INVOICE_VAT_TYPES.includes(line.vatType)) {
      throw new Error(`${name} vatType must be one of: ${INVOICE_VAT_TYPES.join(', ')}`);
    }
    this.validatePercent(line.vatInPercent, `${name} vatInPercent`);
  }

  private validateInvoiceDraftRequest(draft: InvoiceDraftRequest): void {
    if (!draft || typeof draft !== 'object') {
      throw new Error('Invoice draft is required');
    }

    if (!DRAFT_TYPES.includes(draft.type)) {
      throw new Error(`Invoice draft type is required and must be one of: ${DRAFT_TYPES.join(', ')}`);
    }
    this.validateId(draft.customerId, 'customerId');
    if (draft.contactPersonId !== undefined) this.validateId(draft.contactPersonId, 'contactPersonId');
    if (draft.projectId !== undefined) this.validateId(draft.projectId, 'projectId');
    if (!Number.isInteger(draft.daysUntilDueDate) || draft.daysUntilDueDate < 0) {
      throw new Error('daysUntilDueDate is required and must be a non-negative integer');
    }

    this.validateDate(draft.issueDate, 'issueDate');
    this.validateDate(draft.startDate, 'startDate', draft.type === 'repeating_invoice');
    this.validateDate(draft.endDate, 'endDate');
    this.validateCurrency(draft.currency);
    this.validateRoundingType(draft.roundingType);

    if (draft.frequency !== undefined) {
      const { interval, intervalUnit } = draft.frequency;
      if (!Number.isInteger(interval) || interval < 1 || !['DAY', 'WEEK', 'MONTH'].includes(intervalUnit)) {
        throw new Error('frequency needs an integer interval >= 1 and an intervalUnit of DAY, WEEK or MONTH');
      }
    }

    if (draft.lines !== undefined && !Array.isArray(draft.lines)) {
      throw new Error('Invoice draft lines must be an array');
    }
    draft.lines?.forEach((line, index) => this.validateInvoiceDraftLine(line, index));
  }

  private validateInvoiceDraftLine(line: InvoiceDraftLine, index: number): void {
    const name = `Invoice draft line ${index + 1}`;
    this.validateLineCommon(line, name);
    this.validateCents(line.unitPrice, `${name} unitPrice`);
    if (line.vatType !== undefined && !SALES_VAT_TYPES.includes(line.vatType)) {
      throw new Error(`${name} vatType must be one of: ${SALES_VAT_TYPES.join(', ')}`);
    }
  }

  // Fields invoiceLineRequest and invoiceishDraftLine have in common
  private validateLineCommon(line: InvoiceLineRequest | InvoiceDraftLine, name: string): void {
    if (!line || typeof line !== 'object') {
      throw new Error(`${name} must be an object`);
    }
    if (typeof line.quantity !== 'number' || !Number.isFinite(line.quantity)) {
      throw new Error(`${name} quantity is required and must be a number`);
    }
    if (line.productId !== undefined) this.validateId(line.productId, `${name} productId`);
    this.validatePercent(line.discount, `${name} discount`);
    this.validateMaxLength(line.description, 200, `${name} description`);
    this.validateMaxLength(line.comment, 200, `${name} comment`);
  }

  private validateUpdateInvoiceRequest(updates: UpdateInvoiceRequest): void {
    if (!updates || typeof updates !== 'object') {
      throw new Error('Invoice updates are required');
    }
    this.validateDate(updates.newDueDate, 'newDueDate');
    if (updates.sentManually !== undefined && typeof updates.sentManually !== 'boolean') {
      throw new Error('sentManually must be a boolean');
    }
  }

  private validateSendInvoiceRequest(sendRequest: SendInvoiceRequest): void {
    if (!sendRequest || typeof sendRequest !== 'object') {
      throw new Error('Send request is required');
    }
    this.validateId(sendRequest.invoiceId, 'invoiceId');

    const { method } = sendRequest;
    if (!Array.isArray(method) || method.length === 0 || !method.every(m => SEND_METHODS.includes(m))) {
      throw new Error(`method is required: a non-empty array of ${SEND_METHODS.join(', ')}, in priority order`);
    }
    if (typeof sendRequest.includeDocumentAttachments !== 'boolean') {
      throw new Error('includeDocumentAttachments is required and must be a boolean');
    }
    if (sendRequest.emailSendOption !== undefined && !EMAIL_SEND_OPTIONS.includes(sendRequest.emailSendOption)) {
      throw new Error(`emailSendOption must be one of: ${EMAIL_SEND_OPTIONS.join(', ')}`);
    }
  }

  private validateDate(value: string | undefined, field: string, required = false): void {
    if (value === undefined || value === null || value === '') {
      if (required) throw new Error(`${field} is required (format yyyy-mm-dd)`);
      return;
    }
    if (typeof value !== 'string' || !this.isValidDate(value)) {
      throw new Error(`Invalid ${field} format. Expected yyyy-mm-dd`);
    }
  }

  private validateCurrency(currency: string | undefined): void {
    if (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) {
      throw new Error('currency must be a 3-letter uppercase ISO 4217 code, e.g. NOK');
    }
  }

  private validateRoundingType(roundingType: RoundingType | undefined): void {
    if (roundingType !== undefined && !ROUNDING_TYPES.includes(roundingType)) {
      throw new Error(`roundingType must be one of: ${ROUNDING_TYPES.join(', ')}`);
    }
  }

  private validateCents(value: number | undefined, field: string): void {
    if (value !== undefined && !Number.isSafeInteger(value)) {
      throw new Error(`${field} must be an integer amount in cents (øre)`);
    }
  }

  private validatePercent(value: number | undefined, field: string): void {
    if (value !== undefined && (typeof value !== 'number' || value < 0 || value > 100)) {
      throw new Error(`${field} must be a percentage between 0 and 100`);
    }
  }

  private validateMaxLength(value: string | undefined, max: number, field: string): void {
    if (value !== undefined && (typeof value !== 'string' || value.length > max)) {
      throw new Error(`${field} must be a string of at most ${max} characters`);
    }
  }
}

const INVOICE_VAT_TYPES: InvoiceVatType[] = [
  'HIGH', 'MEDIUM', 'LOW', 'EXEMPT', 'EXEMPT_IMPORT_EXPORT', 'EXEMPT_REVERSE', 'OUTSIDE', 'NONE',
];
const SALES_VAT_TYPES: SalesVatType[] = [...INVOICE_VAT_TYPES, 'RAW_FISH'];
const DRAFT_TYPES: InvoiceDraftType[] = [
  'invoice', 'cash_invoice', 'offer', 'order_confirmation', 'credit_note', 'repeating_invoice',
];
const SEND_METHODS: InvoiceSendMethod[] = ['email', 'ehf', 'efaktura', 'sms', 'letter', 'auto'];
const EMAIL_SEND_OPTIONS: EmailSendOption[] = ['document_link', 'attachment', 'auto'];
const ROUNDING_TYPES: RoundingType[] = ['none', 'round_half', 'round_whole', 'round_down_half', 'round_down_whole'];
