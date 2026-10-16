/**
 * Unit tests for FikenSalesDocumentService
 */

import { FikenSalesDocumentService } from '../fiken-sales-document.service';
import { SalesDocumentType } from '../../types/fiken.types';

global.fetch = jest.fn();

describe('FikenSalesDocumentService', () => {
  let service: FikenSalesDocumentService;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  const baseUrl = 'https://api.fiken.no/api/v2';
  const companySlug = 'test-company';

  beforeEach(() => {
    mockFetch = fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockReset();
    service = new FikenSalesDocumentService({ apiToken: 'test-token', baseUrl, enableLogging: false });
  });

  const mockResponse = (data: any, status = 200, location?: string) => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status,
      json: async () => data,
      text: async () => JSON.stringify(data),
      headers: {
        get: (name: string) => {
          if (name === 'content-type') return 'application/json';
          if (name === 'content-length') return data === undefined ? '0' : '100';
          if (name === 'Location') return location ?? null;
          return null;
        },
      },
    } as unknown as Response);
  };

  const lastCall = () => {
    const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    return { url: String(url), method: init!.method, body: init!.body ? JSON.parse(init!.body as string) : undefined };
  };

  describe('credit notes', () => {
    it('lists credit notes with filters', async () => {
      mockResponse([{ creditNoteId: 1 }]);

      const result = await service.getCreditNotes(companySlug, { page: 1, settled: false, customerId: 7 });

      expect(lastCall()).toMatchObject({
        url: `${baseUrl}/companies/${companySlug}/creditNotes?page=1&settled=false&customerId=7`,
        method: 'GET',
      });
      expect(result.data).toEqual([{ creditNoteId: 1 }]);
    });

    it('creates full and partial credit notes on their own endpoints', async () => {
      mockResponse(undefined, 201, `${baseUrl}/companies/${companySlug}/creditNotes/55`);
      const full = await service.createFullCreditNote(companySlug, { issueDate: '2024-01-01', invoiceId: 9 });
      expect(lastCall()).toMatchObject({
        url: `${baseUrl}/companies/${companySlug}/creditNotes/full`,
        method: 'POST',
        body: { issueDate: '2024-01-01', invoiceId: 9 },
      });
      expect(full.location).toBe(`${baseUrl}/companies/${companySlug}/creditNotes/55`);

      mockResponse(undefined, 201);
      await service.createPartialCreditNote(companySlug, {
        issueDate: '2024-01-01',
        lines: [{ unitPrice: 10000, quantity: 1 }],
      });
      expect(lastCall()).toMatchObject({ url: `${baseUrl}/companies/${companySlug}/creditNotes/partial`, method: 'POST' });
    });
  });

  describe('drafts and counters', () => {
    it.each<[SalesDocumentType, string, string]>([
      ['credit_note', 'creditNotes', 'createCreditNote'],
      ['offer', 'offers', 'createOffer'],
      ['order_confirmation', 'orderConfirmations', 'createOrderConfirmation'],
    ])('routes %s drafts to /%s', async (documentType, path, createAction) => {
      mockResponse(undefined, 201);
      await service.createDraft(companySlug, documentType, { customerId: 1, daysUntilDueDate: 14 });
      expect(lastCall()).toMatchObject({
        url: `${baseUrl}/companies/${companySlug}/${path}/drafts`,
        method: 'POST',
        body: { customerId: 1, daysUntilDueDate: 14, type: documentType },
      });

      mockResponse(undefined, 201);
      await service.updateDraft(companySlug, documentType, 3, { customerId: 1, daysUntilDueDate: 14 });
      expect(lastCall()).toMatchObject({ url: `${baseUrl}/companies/${companySlug}/${path}/drafts/3`, method: 'PUT' });

      mockResponse(undefined, 201);
      await service.createFromDraft(companySlug, documentType, 3);
      expect(lastCall()).toMatchObject({
        url: `${baseUrl}/companies/${companySlug}/${path}/drafts/3/${createAction}`,
        method: 'POST',
        body: undefined,
      });

      mockResponse([]);
      await service.getDraftAttachments(companySlug, documentType, 3);
      expect(lastCall()).toMatchObject({
        url: `${baseUrl}/companies/${companySlug}/${path}/drafts/3/attachments`,
        method: 'GET',
      });

      mockResponse({ value: 10000 });
      await service.getCounter(companySlug, documentType);
      expect(lastCall()).toMatchObject({ url: `${baseUrl}/companies/${companySlug}/${path}/counter`, method: 'GET' });
    });

    it('creates a counter with an optional start value', async () => {
      mockResponse(undefined, 201);
      await service.createCounter(companySlug, 'offer', { value: 500 });
      expect(lastCall()).toMatchObject({
        url: `${baseUrl}/companies/${companySlug}/offers/counter`,
        method: 'POST',
        body: { value: 500 },
      });
    });

    it('rejects an unknown document type', async () => {
      await expect(service.getDrafts(companySlug, 'invoice' as SalesDocumentType)).rejects.toThrow('documentType');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('order confirmations', () => {
    it('creates an invoice draft from an order confirmation', async () => {
      mockResponse(undefined, 201, `${baseUrl}/companies/${companySlug}/invoices/drafts/77`);
      const result = await service.createInvoiceDraftFromOrderConfirmation(companySlug, 12);
      expect(lastCall()).toMatchObject({
        url: `${baseUrl}/companies/${companySlug}/orderConfirmations/12/createInvoiceDraft`,
        method: 'POST',
      });
      expect(result.location).toContain('/invoices/drafts/77');
    });
  });

  describe('recurring invoices', () => {
    it('updates job schedule, recipients and pause state on the job path', async () => {
      const jobPath = `${baseUrl}/companies/${companySlug}/recurringInvoices/5/jobs/6`;

      mockResponse(undefined);
      await service.updateRecurringInvoiceJobSchedule(companySlug, 5, 6, { nextDate: '2024-02-01' });
      expect(lastCall()).toMatchObject({ url: `${jobPath}/schedule`, method: 'PUT', body: { nextDate: '2024-02-01' } });

      mockResponse(undefined);
      await service.updateRecurringInvoiceJobRecipients(companySlug, 5, 6, { emails: ['a@b.no'] });
      expect(lastCall()).toMatchObject({ url: `${jobPath}/recipients`, method: 'PUT' });

      mockResponse(undefined);
      await service.pauseRecurringInvoiceJob(companySlug, 5, 6);
      expect(lastCall()).toMatchObject({ url: `${jobPath}/pause`, method: 'POST' });

      mockResponse(undefined);
      await service.resumeRecurringInvoiceJob(companySlug, 5, 6);
      expect(lastCall()).toMatchObject({ url: `${jobPath}/resume`, method: 'POST' });
    });

    it('replaces lines and frequency on the collection', async () => {
      mockResponse(undefined);
      await service.updateRecurringInvoiceLines(companySlug, 5, { lines: [{ quantity: 1, unitPrice: 100 }] });
      expect(lastCall()).toMatchObject({ url: `${baseUrl}/companies/${companySlug}/recurringInvoices/5/lines`, method: 'PUT' });

      mockResponse(undefined);
      await service.updateRecurringInvoiceFrequency(companySlug, 5, {
        frequency: { interval: 1, intervalUnit: 'MONTH' },
        daysUntilDueDate: 14,
      });
      expect(lastCall()).toMatchObject({
        url: `${baseUrl}/companies/${companySlug}/recurringInvoices/5/frequency`,
        method: 'PUT',
      });
    });
  });

  describe('validation', () => {
    it.each([0, -1, 1.5, NaN])('rejects id %p before calling the API', async id => {
      await expect(service.getCreditNote(companySlug, id)).rejects.toThrow('creditNoteId');
      await expect(service.getDraft(companySlug, 'offer', id)).rejects.toThrow('draftId');
      await expect(service.pauseRecurringInvoiceJob(companySlug, 1, id)).rejects.toThrow('jobId');
      await expect(service.getRecurringInvoice(companySlug, id)).rejects.toThrow('recurringInvoiceId');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects a company slug that could escape the path', async () => {
      await expect(service.getOffers('../other')).rejects.toThrow('Company slug');
      await expect(service.getCounter('a/b', 'credit_note')).rejects.toThrow('Company slug');
      await expect(service.createRecurringInvoice('', {} as any)).rejects.toThrow('Company slug');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
