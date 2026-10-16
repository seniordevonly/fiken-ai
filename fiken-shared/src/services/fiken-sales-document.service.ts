/**
 * Fiken Credit notes, offers, order confirmations and recurring invoices
 */

import { FikenBaseService, FikenConfig } from './fiken-base.service';
import {
  AddRecurringInvoiceJobRequest,
  Attachment,
  Counter,
  CreditNoteQueryParams,
  CreditNoteResult,
  FikenApiResponse,
  FullCreditNoteRequest,
  Offer,
  OrderConfirmation,
  PartialCreditNoteRequest,
  RecurringInvoiceQueryParams,
  RecurringInvoiceRecipient,
  RecurringInvoiceRequest,
  RecurringInvoiceResult,
  SalesDocumentDraftRequest,
  SalesDocumentDraftResult,
  SalesDocumentPageParams,
  SalesDocumentType,
  UpdateRecurringInvoiceFrequencyRequest,
  UpdateRecurringInvoiceJobScheduleRequest,
  UpdateRecurringInvoiceLinesRequest,
} from '../types/fiken.types';

// Credit notes, offers and order confirmations share the same drafts/counter layout under their own path
const DOCUMENT_PATHS: Record<SalesDocumentType, { path: string; createFromDraft: string }> = {
  credit_note: { path: 'creditNotes', createFromDraft: 'createCreditNote' },
  offer: { path: 'offers', createFromDraft: 'createOffer' },
  order_confirmation: { path: 'orderConfirmations', createFromDraft: 'createOrderConfirmation' },
};

export class FikenSalesDocumentService extends FikenBaseService {
  constructor(config: FikenConfig) {
    super(config);
  }

  // ========== CREDIT NOTES ==========

  /**
   * GET /companies/{companySlug}/creditNotes
   */
  async getCreditNotes(
    companySlug: string,
    params?: CreditNoteQueryParams
  ): Promise<FikenApiResponse<CreditNoteResult[]>> {
    this.validateCompanySlug(companySlug);
    return this.get<CreditNoteResult[]>(`/companies/${companySlug}/creditNotes`, params);
  }

  /**
   * GET /companies/{companySlug}/creditNotes/{creditNoteId}
   */
  async getCreditNote(companySlug: string, creditNoteId: number): Promise<FikenApiResponse<CreditNoteResult>> {
    this.validateCompanySlug(companySlug);
    this.validateId(creditNoteId, 'creditNoteId');
    return this.get<CreditNoteResult>(`/companies/${companySlug}/creditNotes/${creditNoteId}`);
  }

  /**
   * Credits the full amount of an invoice
   * POST /companies/{companySlug}/creditNotes/full
   */
  async createFullCreditNote(companySlug: string, request: FullCreditNoteRequest): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    return this.post<void>(`/companies/${companySlug}/creditNotes/full`, request);
  }

  /**
   * Credits part of an invoice, or stands alone when no invoiceId is given
   * POST /companies/{companySlug}/creditNotes/partial
   */
  async createPartialCreditNote(
    companySlug: string,
    request: PartialCreditNoteRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    return this.post<void>(`/companies/${companySlug}/creditNotes/partial`, request);
  }

  // ========== OFFERS ==========

  /**
   * GET /companies/{companySlug}/offers
   */
  async getOffers(companySlug: string, params?: SalesDocumentPageParams): Promise<FikenApiResponse<Offer[]>> {
    this.validateCompanySlug(companySlug);
    return this.get<Offer[]>(`/companies/${companySlug}/offers`, params);
  }

  /**
   * GET /companies/{companySlug}/offers/{offerId}
   */
  async getOffer(companySlug: string, offerId: number): Promise<FikenApiResponse<Offer>> {
    this.validateCompanySlug(companySlug);
    this.validateId(offerId, 'offerId');
    return this.get<Offer>(`/companies/${companySlug}/offers/${offerId}`);
  }

  // ========== ORDER CONFIRMATIONS ==========

  /**
   * GET /companies/{companySlug}/orderConfirmations
   */
  async getOrderConfirmations(
    companySlug: string,
    params?: SalesDocumentPageParams
  ): Promise<FikenApiResponse<OrderConfirmation[]>> {
    this.validateCompanySlug(companySlug);
    return this.get<OrderConfirmation[]>(`/companies/${companySlug}/orderConfirmations`, params);
  }

  /**
   * GET /companies/{companySlug}/orderConfirmations/{confirmationId}
   */
  async getOrderConfirmation(
    companySlug: string,
    confirmationId: number
  ): Promise<FikenApiResponse<OrderConfirmation>> {
    this.validateCompanySlug(companySlug);
    this.validateId(confirmationId, 'confirmationId');
    return this.get<OrderConfirmation>(`/companies/${companySlug}/orderConfirmations/${confirmationId}`);
  }

  /**
   * Location points at the new invoice draft
   * POST /companies/{companySlug}/orderConfirmations/{confirmationId}/createInvoiceDraft
   */
  async createInvoiceDraftFromOrderConfirmation(
    companySlug: string,
    confirmationId: number
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(confirmationId, 'confirmationId');
    return this.post<void>(`/companies/${companySlug}/orderConfirmations/${confirmationId}/createInvoiceDraft`);
  }

  // ========== DRAFTS AND COUNTERS (credit notes, offers, order confirmations) ==========

  /**
   * GET /companies/{companySlug}/{creditNotes|offers|orderConfirmations}/drafts
   */
  async getDrafts(
    companySlug: string,
    documentType: SalesDocumentType,
    params?: SalesDocumentPageParams
  ): Promise<FikenApiResponse<SalesDocumentDraftResult[]>> {
    return this.get<SalesDocumentDraftResult[]>(`${this.documentPath(companySlug, documentType)}/drafts`, params);
  }

  /**
   * GET /companies/{companySlug}/{creditNotes|offers|orderConfirmations}/drafts/{draftId}
   */
  async getDraft(
    companySlug: string,
    documentType: SalesDocumentType,
    draftId: number
  ): Promise<FikenApiResponse<SalesDocumentDraftResult>> {
    this.validateId(draftId, 'draftId');
    return this.get<SalesDocumentDraftResult>(`${this.documentPath(companySlug, documentType)}/drafts/${draftId}`);
  }

  /**
   * The draft's type always matches the endpoint, so callers don't pass it
   * POST /companies/{companySlug}/{creditNotes|offers|orderConfirmations}/drafts
   */
  async createDraft(
    companySlug: string,
    documentType: SalesDocumentType,
    draft: Omit<SalesDocumentDraftRequest, 'type'>
  ): Promise<FikenApiResponse<void>> {
    return this.post<void>(`${this.documentPath(companySlug, documentType)}/drafts`, { ...draft, type: documentType });
  }

  /**
   * PUT /companies/{companySlug}/{creditNotes|offers|orderConfirmations}/drafts/{draftId}
   */
  async updateDraft(
    companySlug: string,
    documentType: SalesDocumentType,
    draftId: number,
    draft: Omit<SalesDocumentDraftRequest, 'type'>
  ): Promise<FikenApiResponse<void>> {
    this.validateId(draftId, 'draftId');
    return this.put<void>(
      `${this.documentPath(companySlug, documentType)}/drafts/${draftId}`,
      { ...draft, type: documentType }
    );
  }

  /**
   * GET /companies/{companySlug}/{creditNotes|offers|orderConfirmations}/drafts/{draftId}/attachments
   */
  async getDraftAttachments(
    companySlug: string,
    documentType: SalesDocumentType,
    draftId: number
  ): Promise<FikenApiResponse<Attachment[]>> {
    this.validateId(draftId, 'draftId');
    return this.get<Attachment[]>(`${this.documentPath(companySlug, documentType)}/drafts/${draftId}/attachments`);
  }

  /**
   * Turns a draft into an issued document; Location points at the new credit note/offer/order confirmation
   * POST /companies/{companySlug}/creditNotes/drafts/{draftId}/createCreditNote (and the offer/order confirmation
   * equivalents)
   */
  async createFromDraft(
    companySlug: string,
    documentType: SalesDocumentType,
    draftId: number
  ): Promise<FikenApiResponse<void>> {
    this.validateId(draftId, 'draftId');
    const path = this.documentPath(companySlug, documentType);
    return this.post<void>(`${path}/drafts/${draftId}/${DOCUMENT_PATHS[documentType].createFromDraft}`);
  }

  /**
   * GET /companies/{companySlug}/{creditNotes|offers|orderConfirmations}/counter
   */
  async getCounter(companySlug: string, documentType: SalesDocumentType): Promise<FikenApiResponse<Counter>> {
    return this.get<Counter>(`${this.documentPath(companySlug, documentType)}/counter`);
  }

  /**
   * Fiken defaults the base number to 10000 (first document 10001) when no value is given
   * POST /companies/{companySlug}/{creditNotes|offers|orderConfirmations}/counter
   */
  async createCounter(
    companySlug: string,
    documentType: SalesDocumentType,
    counter?: Counter
  ): Promise<FikenApiResponse<void>> {
    return this.post<void>(`${this.documentPath(companySlug, documentType)}/counter`, counter);
  }

  // ========== RECURRING INVOICES ==========

  /**
   * GET /companies/{companySlug}/recurringInvoices
   */
  async getRecurringInvoices(
    companySlug: string,
    params?: RecurringInvoiceQueryParams
  ): Promise<FikenApiResponse<RecurringInvoiceResult[]>> {
    this.validateCompanySlug(companySlug);
    return this.get<RecurringInvoiceResult[]>(`/companies/${companySlug}/recurringInvoices`, params);
  }

  /**
   * GET /companies/{companySlug}/recurringInvoices/{recurringInvoiceId}
   */
  async getRecurringInvoice(
    companySlug: string,
    recurringInvoiceId: number
  ): Promise<FikenApiResponse<RecurringInvoiceResult>> {
    return this.get<RecurringInvoiceResult>(this.recurringInvoicePath(companySlug, recurringInvoiceId));
  }

  /**
   * POST /companies/{companySlug}/recurringInvoices
   */
  async createRecurringInvoice(
    companySlug: string,
    request: RecurringInvoiceRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    return this.post<void>(`/companies/${companySlug}/recurringInvoices`, request);
  }

  /**
   * Adds another customer to the recurring invoice, copying lines and settings from an existing job
   * POST /companies/{companySlug}/recurringInvoices/{recurringInvoiceId}/jobs
   */
  async addRecurringInvoiceJob(
    companySlug: string,
    recurringInvoiceId: number,
    request: AddRecurringInvoiceJobRequest
  ): Promise<FikenApiResponse<void>> {
    return this.post<void>(`${this.recurringInvoicePath(companySlug, recurringInvoiceId)}/jobs`, request);
  }

  /**
   * Replaces the lines of every job
   * PUT /companies/{companySlug}/recurringInvoices/{recurringInvoiceId}/lines
   */
  async updateRecurringInvoiceLines(
    companySlug: string,
    recurringInvoiceId: number,
    request: UpdateRecurringInvoiceLinesRequest
  ): Promise<FikenApiResponse<void>> {
    return this.put<void>(`${this.recurringInvoicePath(companySlug, recurringInvoiceId)}/lines`, request);
  }

  /**
   * PUT /companies/{companySlug}/recurringInvoices/{recurringInvoiceId}/frequency
   */
  async updateRecurringInvoiceFrequency(
    companySlug: string,
    recurringInvoiceId: number,
    request: UpdateRecurringInvoiceFrequencyRequest
  ): Promise<FikenApiResponse<void>> {
    return this.put<void>(`${this.recurringInvoicePath(companySlug, recurringInvoiceId)}/frequency`, request);
  }

  /**
   * PUT /companies/{companySlug}/recurringInvoices/{recurringInvoiceId}/jobs/{jobId}/schedule
   */
  async updateRecurringInvoiceJobSchedule(
    companySlug: string,
    recurringInvoiceId: number,
    jobId: number,
    request: UpdateRecurringInvoiceJobScheduleRequest
  ): Promise<FikenApiResponse<void>> {
    return this.put<void>(`${this.jobPath(companySlug, recurringInvoiceId, jobId)}/schedule`, request);
  }

  /**
   * Replaces the job's delivery configuration; channels left out are turned off
   * PUT /companies/{companySlug}/recurringInvoices/{recurringInvoiceId}/jobs/{jobId}/recipients
   */
  async updateRecurringInvoiceJobRecipients(
    companySlug: string,
    recurringInvoiceId: number,
    jobId: number,
    recipients: RecurringInvoiceRecipient
  ): Promise<FikenApiResponse<void>> {
    return this.put<void>(`${this.jobPath(companySlug, recurringInvoiceId, jobId)}/recipients`, recipients);
  }

  /**
   * POST /companies/{companySlug}/recurringInvoices/{recurringInvoiceId}/jobs/{jobId}/pause
   */
  async pauseRecurringInvoiceJob(
    companySlug: string,
    recurringInvoiceId: number,
    jobId: number
  ): Promise<FikenApiResponse<void>> {
    return this.post<void>(`${this.jobPath(companySlug, recurringInvoiceId, jobId)}/pause`);
  }

  /**
   * POST /companies/{companySlug}/recurringInvoices/{recurringInvoiceId}/jobs/{jobId}/resume
   */
  async resumeRecurringInvoiceJob(
    companySlug: string,
    recurringInvoiceId: number,
    jobId: number
  ): Promise<FikenApiResponse<void>> {
    return this.post<void>(`${this.jobPath(companySlug, recurringInvoiceId, jobId)}/resume`);
  }

  private documentPath(companySlug: string, documentType: SalesDocumentType): string {
    this.validateCompanySlug(companySlug);
    const document = DOCUMENT_PATHS[documentType];
    if (!document) {
      throw new Error(`documentType must be one of: ${Object.keys(DOCUMENT_PATHS).join(', ')}`);
    }
    return `/companies/${companySlug}/${document.path}`;
  }

  private recurringInvoicePath(companySlug: string, recurringInvoiceId: number): string {
    this.validateCompanySlug(companySlug);
    this.validateId(recurringInvoiceId, 'recurringInvoiceId');
    return `/companies/${companySlug}/recurringInvoices/${recurringInvoiceId}`;
  }

  private jobPath(companySlug: string, recurringInvoiceId: number, jobId: number): string {
    this.validateId(jobId, 'jobId');
    return `${this.recurringInvoicePath(companySlug, recurringInvoiceId)}/jobs/${jobId}`;
  }
}
