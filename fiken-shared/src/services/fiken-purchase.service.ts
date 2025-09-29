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
    
    return this.post<void>(`/companies/${companySlug}/purchases`, purchase);
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
    this.validateDraftRequest(draft);
    
    // Ensure paid is always set (defaults to false if not provided)
    const draftWithPaid: DraftRequest = {
      ...draft,
      paid: draft.paid ?? false
    };
    
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
    this.validateDraftRequest(draft);
    
    // Ensure paid is always set (defaults to false if not provided)
    const draftWithPaid: DraftRequest = {
      ...draft,
      paid: draft.paid ?? false
    };
    
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
    
    const formData = new FormData();
    formData.append('filename', attachment.filename);
    formData.append('file', attachment.file);
    
    if (attachment.attachToPayment !== undefined) {
      formData.append('attachToPayment', String(attachment.attachToPayment));
    }
    
    if (attachment.attachToSale !== undefined) {
      formData.append('attachToSale', String(attachment.attachToSale));
    }
    
    return this.uploadMultipart<void>(
      `/companies/${companySlug}/purchases/${purchaseId}/attachments`,
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
    
    const formData = new FormData();
    formData.append('filename', attachment.filename);
    formData.append('file', attachment.file);
    
    if (attachment.attachToPayment !== undefined) {
      formData.append('attachToPayment', String(attachment.attachToPayment));
    }
    
    if (attachment.attachToSale !== undefined) {
      formData.append('attachToSale', String(attachment.attachToSale));
    }
    
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
    
    if (typeof payment.amount !== 'number') {
      throw new Error('Payment amount is required and must be a number');
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
    
    // At least one of attachToPayment or attachToSale must be true
    if (!attachment.attachToPayment && !attachment.attachToSale) {
      throw new Error('At least one of attachToPayment or attachToSale must be true');
    }
  }
}
