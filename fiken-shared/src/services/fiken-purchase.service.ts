/**
 * Fiken Purchase Service - Implements purchase APIs from swagger specification
 */

import { FikenBaseService, FikenConfig } from './fiken-base.service';
import {
  PurchaseRequest,
  PurchaseResult,
  PurchaseQueryParams,
  DraftRequest,
  DraftResult,
  DraftQueryParams,
  Payment,
  Attachment,
  AttachmentUpload,
  PurchaseAccrualRequest,
  PurchaseAccrualResult,
  FikenApiResponse
} from '../types/fiken.types';

export class FikenPurchaseService extends FikenBaseService {
  constructor(config: FikenConfig) {
    super(config);
  }

  // ========== PURCHASE OPERATIONS ==========

  /**
   * Get all purchases for a company
   * GET /companies/{companySlug}/purchases
   */
  async getPurchases(
    companySlug: string,
    params?: PurchaseQueryParams
  ): Promise<FikenApiResponse<PurchaseResult[]>> {
    this.validateCompanySlug(companySlug);
    
    return this.get<PurchaseResult[]>(`/companies/${companySlug}/purchases`, params);
  }

  /**
   * Create a new purchase
   * POST /companies/{companySlug}/purchases
   */
  async createPurchase(
    companySlug: string,
    purchase: PurchaseRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validatePurchaseRequest(purchase);
    
    // paid is required by the spec; default it for callers that omit it
    return this.post<void>(`/companies/${companySlug}/purchases`, { ...purchase, paid: purchase.paid ?? false });
  }

  /**
   * Get a specific purchase by ID
   * GET /companies/{companySlug}/purchases/{purchaseId}
   */
  async getPurchase(
    companySlug: string,
    purchaseId: number
  ): Promise<FikenApiResponse<PurchaseResult>> {
    this.validateCompanySlug(companySlug);
    this.validateId(purchaseId, 'purchaseId');
    
    return this.get<PurchaseResult>(`/companies/${companySlug}/purchases/${purchaseId}`);
  }

  /**
   * Delete a purchase (sets deleted flag and creates reverse transaction)
   * PATCH /companies/{companySlug}/purchases/{purchaseId}/delete
   */
  async deletePurchase(
    companySlug: string,
    purchaseId: number,
    description: string
  ): Promise<FikenApiResponse<PurchaseResult>> {
    this.validateCompanySlug(companySlug);
    this.validateId(purchaseId, 'purchaseId');
    
    if (!description || typeof description !== 'string') {
      throw new Error('Description is required for deleting a purchase');
    }
    
    return this.patch<PurchaseResult>(
      `/companies/${companySlug}/purchases/${purchaseId}/delete?description=${encodeURIComponent(description)}`
    );
  }

  // ========== PURCHASE DRAFT OPERATIONS ==========

  /**
   * Get all purchase drafts for a company
   * GET /companies/{companySlug}/purchases/drafts
   */
  async getPurchaseDrafts(
    companySlug: string,
    params?: DraftQueryParams
  ): Promise<FikenApiResponse<DraftResult[]>> {
    this.validateCompanySlug(companySlug);
    
    return this.get<DraftResult[]>(`/companies/${companySlug}/purchases/drafts`, params);
  }

  /**
   * Create a new purchase draft
   * POST /companies/{companySlug}/purchases/drafts
   */
  async createPurchaseDraft(
    companySlug: string,
    draft: DraftRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    // Ensure paid is always set (defaults to false if not provided)
    const draftWithPaid: DraftRequest = draft && {
      ...draft,
      paid: draft.paid ?? false
    };
    this.validateDraftRequest(draftWithPaid);
    
    return this.post<void>(`/companies/${companySlug}/purchases/drafts`, draftWithPaid);
  }

  /**
   * Get a specific purchase draft by ID
   * GET /companies/{companySlug}/purchases/drafts/{draftId}
   */
  async getPurchaseDraft(
    companySlug: string,
    draftId: number
  ): Promise<FikenApiResponse<DraftResult>> {
    this.validateCompanySlug(companySlug);
    this.validateId(draftId, 'draftId');
    
    return this.get<DraftResult>(`/companies/${companySlug}/purchases/drafts/${draftId}`);
  }

  /**
   * Update a purchase draft
   * PUT /companies/{companySlug}/purchases/drafts/{draftId}
   */
  async updatePurchaseDraft(
    companySlug: string,
    draftId: number,
    draft: DraftRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(draftId, 'draftId');
    // Ensure paid is always set (defaults to false if not provided)
    const draftWithPaid: DraftRequest = draft && {
      ...draft,
      paid: draft.paid ?? false
    };
    this.validateDraftRequest(draftWithPaid);
    
    return this.put<void>(`/companies/${companySlug}/purchases/drafts/${draftId}`, draftWithPaid);
  }

  /**
   * Delete a purchase draft
   * DELETE /companies/{companySlug}/purchases/drafts/{draftId}
   */
  async deletePurchaseDraft(
    companySlug: string,
    draftId: number
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(draftId, 'draftId');
    
    return this.delete<void>(`/companies/${companySlug}/purchases/drafts/${draftId}`);
  }

  /**
   * Create a purchase from an existing draft
   * POST /companies/{companySlug}/purchases/drafts/{draftId}/createPurchase
   */
  async createPurchaseFromDraft(
    companySlug: string,
    draftId: number
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(draftId, 'draftId');
    
    return this.post<void>(`/companies/${companySlug}/purchases/drafts/${draftId}/createPurchase`);
  }

  // ========== PURCHASE ATTACHMENT OPERATIONS ==========

  /**
   * Get all attachments for a purchase
   * GET /companies/{companySlug}/purchases/{purchaseId}/attachments
   */
  async getPurchaseAttachments(
    companySlug: string,
    purchaseId: number
  ): Promise<FikenApiResponse<Attachment[]>> {
    this.validateCompanySlug(companySlug);
    this.validateId(purchaseId, 'purchaseId');
    
    return this.get<Attachment[]>(`/companies/${companySlug}/purchases/${purchaseId}/attachments`);
  }

  /**
   * Add attachment to a purchase
   * POST /companies/{companySlug}/purchases/{purchaseId}/attachments
   */
  async addAttachmentToPurchase(
    companySlug: string,
    purchaseId: number,
    attachment: AttachmentUpload
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(purchaseId, 'purchaseId');
    this.validateAttachmentUpload(attachment);
    
    // At least one of attachToPayment and attachToSale must be true
    if (!attachment.attachToPayment && !attachment.attachToSale) {
      throw new Error('At least one of attachToPayment or attachToSale must be true');
    }
    
    const formData = new FormData();
    formData.append('filename', attachment.filename);
    formData.append('file', this.toFilePart(attachment.file), attachment.filename);
    
    // The spec takes the flags as query parameters, not form fields
    const flags = new URLSearchParams();
    if (attachment.attachToPayment !== undefined) {
      flags.append('attachToPayment', String(attachment.attachToPayment));
    }
    if (attachment.attachToSale !== undefined) {
      flags.append('attachToSale', String(attachment.attachToSale));
    }
    
    return this.uploadMultipart<void>(
      `/companies/${companySlug}/purchases/${purchaseId}/attachments?${flags}`,
      formData
    );
  }

  /**
   * Get all attachments for a purchase draft
   * GET /companies/{companySlug}/purchases/drafts/{draftId}/attachments
   */
  async getPurchaseDraftAttachments(
    companySlug: string,
    draftId: number
  ): Promise<FikenApiResponse<Attachment[]>> {
    this.validateCompanySlug(companySlug);
    this.validateId(draftId, 'draftId');
    
    return this.get<Attachment[]>(`/companies/${companySlug}/purchases/drafts/${draftId}/attachments`);
  }

  /**
   * Add attachment to a purchase draft
   * POST /companies/{companySlug}/purchases/drafts/{draftId}/attachments
   */
  async addAttachmentToPurchaseDraft(
    companySlug: string,
    draftId: number,
    attachment: AttachmentUpload
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(draftId, 'draftId');
    this.validateAttachmentUpload(attachment);
    
    // Draft uploads take only filename and file; attachToPayment/attachToSale don't apply
    const formData = new FormData();
    formData.append('filename', attachment.filename);
    formData.append('file', this.toFilePart(attachment.file), attachment.filename);
    
    return this.uploadMultipart<void>(
      `/companies/${companySlug}/purchases/drafts/${draftId}/attachments`,
      formData
    );
  }

  // ========== PURCHASE PAYMENT OPERATIONS ==========

  /**
   * Get all payments for a purchase
   * GET /companies/{companySlug}/purchases/{purchaseId}/payments
   */
  async getPurchasePayments(
    companySlug: string,
    purchaseId: number
  ): Promise<FikenApiResponse<Payment[]>> {
    this.validateCompanySlug(companySlug);
    this.validateId(purchaseId, 'purchaseId');
    
    return this.get<Payment[]>(`/companies/${companySlug}/purchases/${purchaseId}/payments`);
  }

  /**
   * Create a new payment for a purchase
   * POST /companies/{companySlug}/purchases/{purchaseId}/payments
   */
  async createPurchasePayment(
    companySlug: string,
    purchaseId: number,
    payment: Payment
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(purchaseId, 'purchaseId');
    this.validatePayment(payment);
    
    return this.post<void>(`/companies/${companySlug}/purchases/${purchaseId}/payments`, payment);
  }

  /**
   * Get a specific payment for a purchase
   * GET /companies/{companySlug}/purchases/{purchaseId}/payments/{paymentId}
   */
  async getPurchasePayment(
    companySlug: string,
    purchaseId: number,
    paymentId: number
  ): Promise<FikenApiResponse<Payment>> {
    this.validateCompanySlug(companySlug);
    this.validateId(purchaseId, 'purchaseId');
    this.validateId(paymentId, 'paymentId');
    
    return this.get<Payment>(`/companies/${companySlug}/purchases/${purchaseId}/payments/${paymentId}`);
  }

  // ========== PURCHASE ACCRUAL OPERATIONS ==========

  /**
   * Get all accruals on a purchase
   * GET /companies/{companySlug}/purchases/{purchaseId}/accruals
   */
  async getPurchaseAccruals(
    companySlug: string,
    purchaseId: number
  ): Promise<FikenApiResponse<PurchaseAccrualResult[]>> {
    this.validateCompanySlug(companySlug);
    this.validateId(purchaseId, 'purchaseId');
    
    return this.get<PurchaseAccrualResult[]>(`/companies/${companySlug}/purchases/${purchaseId}/accruals`);
  }

  /**
   * Accrue one purchase line over monthly periods
   * POST /companies/{companySlug}/purchases/{purchaseId}/accruals
   */
  async createPurchaseAccrual(
    companySlug: string,
    purchaseId: number,
    accrual: PurchaseAccrualRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(purchaseId, 'purchaseId');
    
    if (!accrual) {
      throw new Error('Accrual request is required');
    }
    this.validateId(accrual.lineId, 'lineId');
    if (!accrual.startDate || !this.isValidDate(accrual.startDate)) {
      throw new Error('Accrual startDate is required (yyyy-mm-dd)');
    }
    if (!Number.isInteger(accrual.periods) || accrual.periods < 1 || accrual.periods > 120) {
      throw new Error('Accrual periods must be an integer from 1 to 120');
    }
    if (!accrual.account) {
      throw new Error('Accrual account is required');
    }
    
    return this.post<void>(`/companies/${companySlug}/purchases/${purchaseId}/accruals`, accrual);
  }

  /**
   * Get one accrual on a purchase
   * GET /companies/{companySlug}/purchases/{purchaseId}/accruals/{accrualId}
   */
  async getPurchaseAccrual(
    companySlug: string,
    purchaseId: number,
    accrualId: number
  ): Promise<FikenApiResponse<PurchaseAccrualResult>> {
    this.validateCompanySlug(companySlug);
    this.validateId(purchaseId, 'purchaseId');
    this.validateId(accrualId, 'accrualId');
    
    return this.get<PurchaseAccrualResult>(`/companies/${companySlug}/purchases/${purchaseId}/accruals/${accrualId}`);
  }

  // ========== VALIDATION METHODS ==========

  /**
   * Validate purchase request
   */
  private validatePurchaseRequest(purchase: PurchaseRequest): void {
    if (!purchase) {
      throw new Error('Purchase request is required');
    }
    
    if (!purchase.date) {
      throw new Error('Purchase date is required');
    }
    
    if (!purchase.kind) {
      throw new Error('Purchase kind is required');
    }
    
    if (!purchase.lines || !Array.isArray(purchase.lines) || purchase.lines.length === 0) {
      throw new Error('Purchase lines are required and must be a non-empty array');
    }
    
    if (!purchase.currency) {
      throw new Error('Purchase currency is required');
    }
    
    // Validate each line
    purchase.lines.forEach((line, index) => {
      if (!line.description) {
        throw new Error(`Line ${index + 1}: Description is required`);
      }
      
      if (!line.vatType) {
        throw new Error(`Line ${index + 1}: VAT type is required`);
      }
      
      if (typeof line.netPrice !== 'number' && typeof line.netPriceInCurrency !== 'number') {
        throw new Error(`Line ${index + 1}: Either netPrice or netPriceInCurrency is required`);
      }
    });
  }

  /**
   * Validate draft request
   */
  private validateDraftRequest(draft: DraftRequest): void {
    if (!draft) {
      throw new Error('Draft request is required');
    }
    
    if (typeof draft.cash !== 'boolean') {
      throw new Error('Draft cash field is required and must be a boolean');
    }
    
    if (typeof draft.paid !== 'boolean') {
      throw new Error('Draft paid field is required and must be a boolean');
    }
    
    if (!draft.lines || !Array.isArray(draft.lines) || draft.lines.length === 0) {
      throw new Error('Draft lines are required and must be a non-empty array');
    }
    
    // Validate each line
    draft.lines.forEach((line, index) => {
      if (!line.text) {
        throw new Error(`Line ${index + 1}: Text is required`);
      }
      
      if (!line.vatType) {
        throw new Error(`Line ${index + 1}: VAT type is required`);
      }
      
      if (!line.incomeAccount) {
        throw new Error(`Line ${index + 1}: Income account is required`);
      }
      
      if (line.net === undefined || line.net === null) {
        throw new Error(`Line ${index + 1}: Net amount is required`);
      }
      
      if (line.gross === undefined || line.gross === null) {
        throw new Error(`Line ${index + 1}: Gross amount is required`);
      }
    });
  }

  /**
   * Validate payment
   */
  private validatePayment(payment: Payment): void {
    if (!payment) {
      throw new Error('Payment is required');
    }
    
    if (!payment.date) {
      throw new Error('Payment date is required');
    }
    
    if (!payment.account) {
      throw new Error('Payment account is required');
    }
    
    if (!Number.isInteger(payment.amount)) {
      throw new Error('Payment amount is required and must be an integer number of cents');
    }
  }

  /**
   * Validate attachment upload
   */
  private validateAttachmentUpload(attachment: AttachmentUpload): void {
    if (!attachment) {
      throw new Error('Attachment is required');
    }
    
    if (!attachment.filename) {
      throw new Error('Attachment filename is required');
    }
    
    if (!attachment.file) {
      throw new Error('Attachment file is required');
    }
    
    // Check if filename has valid extension
    const validExtensions = ['.png', '.jpeg', '.jpg', '.gif', '.pdf'];
    const hasValidExtension = validExtensions.some(ext => 
      attachment.filename.toLowerCase().endsWith(ext)
    );
    
    if (!hasValidExtension) {
      throw new Error('Attachment filename must end with .png, .jpeg, .jpg, .gif, or .pdf');
    }
  }
}
