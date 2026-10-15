/**
 * Fiken Sales (salg) and their drafts, attachments and payments
 */

import { FikenBaseService, FikenConfig } from './fiken-base.service';
import {
  Attachment,
  FikenApiResponse,
  Payment,
  SaleAccrualRequest,
  SaleAccrualResult,
  SaleDraftQueryParams,
  SaleDraftRequest,
  SaleDraftResult,
  SaleQueryParams,
  SaleRequest,
  SaleResult
} from '../types/fiken.types';

export class FikenSaleService extends FikenBaseService {
  constructor(config: FikenConfig) {
    super(config);
  }

  // ========== SALE OPERATIONS ==========

  /**
   * Get all sales for a company
   * GET /companies/{companySlug}/sales
   */
  async getSales(
    companySlug: string,
    params?: SaleQueryParams
  ): Promise<FikenApiResponse<SaleResult[]>> {
    this.validateCompanySlug(companySlug);

    return this.get<SaleResult[]>(`/companies/${companySlug}/sales`, params);
  }

  /**
   * Create a sale whose invoice was made outside Fiken ("annet salg")
   * POST /companies/{companySlug}/sales
   */
  async createSale(
    companySlug: string,
    sale: SaleRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateSaleRequest(sale);

    return this.post<void>(`/companies/${companySlug}/sales`, sale);
  }

  /**
   * Get a specific sale by ID
   * GET /companies/{companySlug}/sales/{saleId}
   */
  async getSale(
    companySlug: string,
    saleId: number
  ): Promise<FikenApiResponse<SaleResult>> {
    this.validateCompanySlug(companySlug);
    this.validateId(saleId, 'saleId');

    return this.get<SaleResult>(`/companies/${companySlug}/sales/${saleId}`);
  }

  /**
   * Get all attachments for a sale
   * GET /companies/{companySlug}/sales/{saleId}/attachments
   */
  async getSaleAttachments(
    companySlug: string,
    saleId: number
  ): Promise<FikenApiResponse<Attachment[]>> {
    this.validateCompanySlug(companySlug);
    this.validateId(saleId, 'saleId');

    return this.get<Attachment[]>(`/companies/${companySlug}/sales/${saleId}/attachments`);
  }

  // ========== SALE PAYMENT OPERATIONS ==========

  /**
   * Get all payments for a sale
   * GET /companies/{companySlug}/sales/{saleId}/payments
   */
  async getSalePayments(
    companySlug: string,
    saleId: number
  ): Promise<FikenApiResponse<Payment[]>> {
    this.validateCompanySlug(companySlug);
    this.validateId(saleId, 'saleId');

    return this.get<Payment[]>(`/companies/${companySlug}/sales/${saleId}/payments`);
  }

  /**
   * Register a payment on a sale
   * POST /companies/{companySlug}/sales/{saleId}/payments
   */
  async createSalePayment(
    companySlug: string,
    saleId: number,
    payment: Payment
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(saleId, 'saleId');
    this.validatePayment(payment);

    return this.post<void>(`/companies/${companySlug}/sales/${saleId}/payments`, payment);
  }

  /**
   * Get a specific payment for a sale
   * GET /companies/{companySlug}/sales/{saleId}/payments/{paymentId}
   */
  async getSalePayment(
    companySlug: string,
    saleId: number,
    paymentId: number
  ): Promise<FikenApiResponse<Payment>> {
    this.validateCompanySlug(companySlug);
    this.validateId(saleId, 'saleId');
    this.validateId(paymentId, 'paymentId');

    return this.get<Payment>(`/companies/${companySlug}/sales/${saleId}/payments/${paymentId}`);
  }

  // ========== SALE ACCRUAL OPERATIONS ==========

  /**
   * Get all accruals (periodisering) on a sale
   * GET /companies/{companySlug}/sales/{saleId}/accruals
   */
  async getSaleAccruals(
    companySlug: string,
    saleId: number
  ): Promise<FikenApiResponse<SaleAccrualResult[]>> {
    this.validateCompanySlug(companySlug);
    this.validateId(saleId, 'saleId');

    return this.get<SaleAccrualResult[]>(`/companies/${companySlug}/sales/${saleId}/accruals`);
  }

  /**
   * Spread one sale line over monthly periods
   * POST /companies/{companySlug}/sales/{saleId}/accruals
   */
  async createSaleAccrual(
    companySlug: string,
    saleId: number,
    accrual: SaleAccrualRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(saleId, 'saleId');
    if (!accrual) {
      throw new Error('Accrual request is required');
    }
    this.validateId(accrual.lineId, 'lineId');
    if (!accrual.startDate) {
      throw new Error('Accrual startDate is required');
    }
    if (!Number.isInteger(accrual.periods) || accrual.periods < 1 || accrual.periods > 120) {
      throw new Error('Accrual periods must be an integer from 1 to 120');
    }

    return this.post<void>(`/companies/${companySlug}/sales/${saleId}/accruals`, accrual);
  }

  /**
   * Get a specific accrual on a sale
   * GET /companies/{companySlug}/sales/{saleId}/accruals/{accrualId}
   */
  async getSaleAccrual(
    companySlug: string,
    saleId: number,
    accrualId: number
  ): Promise<FikenApiResponse<SaleAccrualResult>> {
    this.validateCompanySlug(companySlug);
    this.validateId(saleId, 'saleId');
    this.validateId(accrualId, 'accrualId');

    return this.get<SaleAccrualResult>(`/companies/${companySlug}/sales/${saleId}/accruals/${accrualId}`);
  }

  // ========== SALE DRAFT OPERATIONS ==========

  /**
   * Get all sale drafts for a company
   * GET /companies/{companySlug}/sales/drafts
   */
  async getSaleDrafts(
    companySlug: string,
    params?: SaleDraftQueryParams
  ): Promise<FikenApiResponse<SaleDraftResult[]>> {
    this.validateCompanySlug(companySlug);

    return this.get<SaleDraftResult[]>(`/companies/${companySlug}/sales/drafts`, params);
  }

  /**
   * Create a sale draft
   * POST /companies/{companySlug}/sales/drafts
   */
  async createSaleDraft(
    companySlug: string,
    draft: SaleDraftRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    // paid is required by the spec; default it for callers that omit it
    const draftWithPaid = { ...draft, paid: draft?.paid ?? false };
    this.validateDraftRequest(draftWithPaid);

    return this.post<void>(`/companies/${companySlug}/sales/drafts`, draftWithPaid);
  }

  /**
   * Get a specific sale draft by ID
   * GET /companies/{companySlug}/sales/drafts/{draftId}
   */
  async getSaleDraft(
    companySlug: string,
    draftId: number
  ): Promise<FikenApiResponse<SaleDraftResult>> {
    this.validateCompanySlug(companySlug);
    this.validateId(draftId, 'draftId');

    return this.get<SaleDraftResult>(`/companies/${companySlug}/sales/drafts/${draftId}`);
  }

  /**
   * Replace a sale draft
   * PUT /companies/{companySlug}/sales/drafts/{draftId}
   */
  async updateSaleDraft(
    companySlug: string,
    draftId: number,
    draft: SaleDraftRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(draftId, 'draftId');
    const draftWithPaid = { ...draft, paid: draft?.paid ?? false };
    this.validateDraftRequest(draftWithPaid);

    return this.put<void>(`/companies/${companySlug}/sales/drafts/${draftId}`, draftWithPaid);
  }

  /**
   * Get all attachments for a sale draft
   * GET /companies/{companySlug}/sales/drafts/{draftId}/attachments
   */
  async getSaleDraftAttachments(
    companySlug: string,
    draftId: number
  ): Promise<FikenApiResponse<Attachment[]>> {
    this.validateCompanySlug(companySlug);
    this.validateId(draftId, 'draftId');

    return this.get<Attachment[]>(`/companies/${companySlug}/sales/drafts/${draftId}/attachments`);
  }

  /**
   * Turn a sale draft into a sale; the Location header points at the new sale
   * POST /companies/{companySlug}/sales/drafts/{draftId}/createSale
   */
  async createSaleFromDraft(
    companySlug: string,
    draftId: number
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(draftId, 'draftId');

    return this.post<void>(`/companies/${companySlug}/sales/drafts/${draftId}/createSale`);
  }

  // ========== VALIDATION METHODS ==========

  private validateSaleRequest(sale: SaleRequest): void {
    if (!sale) {
      throw new Error('Sale request is required');
    }
    if (!sale.date) {
      throw new Error('Sale date is required');
    }
    if (!sale.kind) {
      throw new Error('Sale kind is required');
    }
    if (!sale.currency) {
      throw new Error('Sale currency is required');
    }
    if (!Array.isArray(sale.lines) || sale.lines.length === 0) {
      throw new Error('Sale lines are required and must be a non-empty array');
    }

    sale.lines.forEach((line, index) => {
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

  private validateDraftRequest(draft: SaleDraftRequest): void {
    if (typeof draft.cash !== 'boolean') {
      throw new Error('Draft cash field is required and must be a boolean');
    }
    if (!Array.isArray(draft.lines) || draft.lines.length === 0) {
      throw new Error('Draft lines are required and must be a non-empty array');
    }

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
      if (!Number.isInteger(line.net) || !Number.isInteger(line.gross)) {
        throw new Error(`Line ${index + 1}: net and gross are required integer amounts in cents`);
      }
    });
  }

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
}
