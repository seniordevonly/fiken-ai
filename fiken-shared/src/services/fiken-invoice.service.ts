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
  Counter,
  Attachment,
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
    
    return this.patch<void>(`/companies/${companySlug}/invoices/${invoiceId}`, updates);
  }

  /**
   * Send an invoice
   * POST /companies/{companySlug}/invoices/send
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
  ): Promise<FikenApiResponse<Attachment[]>> {
    this.validateCompanySlug(companySlug);
    this.validateId(invoiceId, 'invoiceId');
    
    return this.get<Attachment[]>(`/companies/${companySlug}/invoices/${invoiceId}/attachments`);
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

  // ========== INVOICE DRAFT ATTACHMENTS ==========

  /**
   * Get all attachments for an invoice draft
   * GET /companies/{companySlug}/invoices/drafts/{draftId}/attachments
   */
  async getInvoiceDraftAttachments(
    companySlug: string,
    draftId: number
  ): Promise<FikenApiResponse<Attachment[]>> {
    this.validateCompanySlug(companySlug);
    this.validateId(draftId, 'draftId');
    
    return this.get<Attachment[]>(`/companies/${companySlug}/invoices/drafts/${draftId}/attachments`);
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

  private validateInvoiceRequest(invoice: InvoiceRequest): void {
    if (!invoice.issueDate) {
      throw new Error('Invoice issue date is required');
    }
    
    if (!this.isValidDate(invoice.issueDate)) {
      throw new Error('Invalid invoice issue date format. Expected yyyy-mm-dd');
    }
    
    if (invoice.dueDate && !this.isValidDate(invoice.dueDate)) {
      throw new Error('Invalid invoice due date format. Expected yyyy-mm-dd');
    }
    
    if (!invoice.lines || invoice.lines.length === 0) {
      throw new Error('Invoice must have at least one line');
    }
    
    // Validate each line
    invoice.lines.forEach((line, index) => {
      this.validateInvoiceLine(line, index);
    });
  }

  private validateInvoiceDraftRequest(draft: InvoiceDraftRequest): void {
    if (draft.issueDate && !this.isValidDate(draft.issueDate)) {
      throw new Error('Invalid invoice draft issue date format. Expected yyyy-mm-dd');
    }
    
    if (draft.dueDate && !this.isValidDate(draft.dueDate)) {
      throw new Error('Invalid invoice draft due date format. Expected yyyy-mm-dd');
    }
    
    if (!draft.lines || draft.lines.length === 0) {
      throw new Error('Invoice draft must have at least one line');
    }
    
    // Validate each line
    draft.lines.forEach((line, index) => {
      this.validateInvoiceLine(line, index);
    });
  }

  private validateInvoiceLine(line: any, index: number): void {
    if (!line.productId && !line.description) {
      throw new Error(`Invoice line ${index + 1} must have either productId or description`);
    }
    
    if (line.count !== undefined && line.count < 0) {
      throw new Error(`Invoice line ${index + 1} count cannot be negative`);
    }
    
    if (line.unitPrice !== undefined && line.unitPrice < 0) {
      throw new Error(`Invoice line ${index + 1} unit price cannot be negative`);
    }
    
    if (line.unitAmount !== undefined && line.unitAmount < 0) {
      throw new Error(`Invoice line ${index + 1} unit amount cannot be negative`);
    }
    
    if (line.discount !== undefined && (line.discount < 0 || line.discount > 100)) {
      throw new Error(`Invoice line ${index + 1} discount must be between 0 and 100`);
    }
  }

  private validateSendInvoiceRequest(sendRequest: SendInvoiceRequest): void {
    if (!sendRequest.invoiceId) {
      throw new Error('Invoice ID is required for sending');
    }
    
    if (!sendRequest.method) {
      throw new Error('Send method is required');
    }
    
    const validMethods = ['email', 'ehf', 'vipps', 'auto'];
    if (!validMethods.includes(sendRequest.method)) {
      throw new Error(`Invalid send method. Must be one of: ${validMethods.join(', ')}`);
    }
    
    if (sendRequest.method === 'email' && !sendRequest.recipientEmail) {
      throw new Error('Recipient email is required when sending via email');
    }
  }
}
