/**
 * Unit tests for FikenInvoiceService: endpoint paths, response handling and request validation against the spec
 */

import { FikenInvoiceService } from '../fiken-invoice.service';
import {
  InvoiceDraftRequest,
  InvoiceRequest,
  SendInvoiceRequest,
} from '../../types/fiken.types';

// Mock fetch globally
global.fetch = jest.fn();

describe('FikenInvoiceService', () => {
  let service: FikenInvoiceService;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  const companySlug = 'test-company';
  const baseUrl = 'https://api.fiken.no/api/v2';

  beforeEach(() => {
    mockFetch = fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockReset();

    service = new FikenInvoiceService({ apiToken: 'test-token', baseUrl });
  });

  const mockSuccessResponse = (data: any, status = 200, extraHeaders: Record<string, string> = {}) => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status,
      json: async () => data,
      text: async () => JSON.stringify(data),
      headers: {
        get: (name: string) => {
          if (name === 'content-type') return 'application/json';
          if (name === 'content-length') return data ? '100' : '0';
          return extraHeaders[name] ?? null;
        },
      },
    } as unknown as Response);
  };

  const lastCall = () => {
    const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    return { url: String(url), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined };
  };

  const validInvoice = (): InvoiceRequest => ({
    issueDate: '2024-01-15',
    dueDate: '2024-01-29',
    customerId: 42,
    bankAccountCode: '1920:10001',
    cash: false,
    lines: [{ description: 'Consulting', quantity: 2, unitPrice: 50000, vatType: 'HIGH', incomeAccount: '3000' }],
  });

  const validDraft = (): InvoiceDraftRequest => ({
    type: 'invoice',
    customerId: 42,
    daysUntilDueDate: 14,
    lines: [{ description: 'Consulting', quantity: 1, unitPrice: 100000, vatType: 'HIGH' }],
  });

  const validSend = (): SendInvoiceRequest => ({
    invoiceId: 55,
    method: ['email'],
    includeDocumentAttachments: true,
  });

  describe('getInvoices', () => {
    it('calls the invoices endpoint with query params and returns pagination headers', async () => {
      mockSuccessResponse([{ invoiceId: 1 }], 200, {
        'Fiken-Api-Page': '0',
        'Fiken-Api-Page-Size': '25',
        'Fiken-Api-Page-Count': '3',
        'Fiken-Api-Result-Count': '60',
      });

      const result = await service.getInvoices(companySlug, { page: 0, settled: false, customerId: 42 });

      const { url, method } = lastCall();
      expect(method).toBe('GET');
      expect(url).toBe(`${baseUrl}/companies/${companySlug}/invoices?page=0&settled=false&customerId=42`);
      expect(result.data).toEqual([{ invoiceId: 1 }]);
      expect(result.headers).toEqual({
        'Fiken-Api-Page': 0,
        'Fiken-Api-Page-Size': 25,
        'Fiken-Api-Page-Count': 3,
        'Fiken-Api-Result-Count': 60,
      });
    });
  });

  describe('getInvoice', () => {
    it('calls the invoice endpoint', async () => {
      mockSuccessResponse({ invoiceId: 7 });

      const result = await service.getInvoice(companySlug, 7);

      expect(lastCall().url).toBe(`${baseUrl}/companies/${companySlug}/invoices/7`);
      expect(result.data).toEqual({ invoiceId: 7 });
    });

    it('rejects a non-positive id without calling the API', async () => {
      await expect(service.getInvoice(companySlug, 0)).rejects.toThrow('invoiceId is required');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('createInvoice', () => {
    it('posts the spec-shaped body and exposes the Location header', async () => {
      const location = `${baseUrl}/companies/${companySlug}/invoices/55`;
      mockSuccessResponse(undefined, 201, { Location: location });

      const result = await service.createInvoice(companySlug, validInvoice());

      const { url, method, body } = lastCall();
      expect(method).toBe('POST');
      expect(url).toBe(`${baseUrl}/companies/${companySlug}/invoices`);
      expect(body).toEqual(validInvoice());
      expect(result.location).toBe(location);
    });

    it.each([
      ['issueDate', 'issueDate is required'],
      ['dueDate', 'dueDate is required'],
      ['customerId', 'customerId is required'],
      ['bankAccountCode', 'bankAccountCode is required'],
      ['cash', 'cash is required'],
      ['lines', 'at least one line'],
    ] as const)('requires %s', async (field, message) => {
      const invoice: any = validInvoice();
      delete invoice[field];

      await expect(service.createInvoice(companySlug, invoice)).rejects.toThrow(message);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('requires quantity on every line', async () => {
      const invoice: any = validInvoice();
      invoice.lines[0] = { description: 'x', count: 2 };

      await expect(service.createInvoice(companySlug, invoice)).rejects.toThrow('Invoice line 1 quantity is required');
    });

    it('rejects non-integer cent amounts, unknown VAT types and bad currency', async () => {
      await expect(service.createInvoice(companySlug, { ...validInvoice(), lines: [{ quantity: 1, unitPrice: 10.5 }] }))
        .rejects.toThrow('unitPrice must be an integer amount in cents');
      await expect(service.createInvoice(companySlug, { ...validInvoice(), lines: [{ quantity: 1, vatType: 'HIGH_DIRECT' as any }] }))
        .rejects.toThrow('vatType must be one of');
      await expect(service.createInvoice(companySlug, { ...validInvoice(), currency: 'nok' }))
        .rejects.toThrow('currency must be a 3-letter');
      await expect(service.createInvoice(companySlug, { ...validInvoice(), issueDate: '2024-02-30' }))
        .rejects.toThrow('Invalid issueDate format');
    });

    it('rejects a missing payload with a clear message', async () => {
      await expect(service.createInvoice(companySlug, undefined as any)).rejects.toThrow('Invoice is required');
    });
  });

  describe('updateInvoice', () => {
    it('patches newDueDate', async () => {
      mockSuccessResponse(undefined, 200, { Location: `${baseUrl}/companies/${companySlug}/invoices/7` });

      const result = await service.updateInvoice(companySlug, 7, { newDueDate: '2024-03-01', sentManually: true });

      const { url, method, body } = lastCall();
      expect(method).toBe('PATCH');
      expect(url).toBe(`${baseUrl}/companies/${companySlug}/invoices/7`);
      expect(body).toEqual({ newDueDate: '2024-03-01', sentManually: true });
      expect(result.location).toMatch(/invoices\/7$/);
    });

    it('validates newDueDate', async () => {
      await expect(service.updateInvoice(companySlug, 7, { newDueDate: '01.03.2024' }))
        .rejects.toThrow('Invalid newDueDate format');
    });
  });

  describe('sendInvoice', () => {
    it('posts to the send endpoint', async () => {
      mockSuccessResponse(undefined, 200);

      await service.sendInvoice(companySlug, { ...validSend(), method: ['ehf', 'email'], emailSendOption: 'attachment' });

      const { url, method, body } = lastCall();
      expect(method).toBe('POST');
      expect(url).toBe(`${baseUrl}/companies/${companySlug}/invoices/send`);
      expect(body.method).toEqual(['ehf', 'email']);
    });

    it('requires method to be a non-empty array of spec channels', async () => {
      await expect(service.sendInvoice(companySlug, { ...validSend(), method: 'email' as any }))
        .rejects.toThrow('method is required');
      await expect(service.sendInvoice(companySlug, { ...validSend(), method: [] }))
        .rejects.toThrow('method is required');
      await expect(service.sendInvoice(companySlug, { ...validSend(), method: ['vipps' as any] }))
        .rejects.toThrow('method is required');
    });

    it('requires includeDocumentAttachments and invoiceId', async () => {
      const { includeDocumentAttachments, ...withoutFlag } = validSend();
      await expect(service.sendInvoice(companySlug, withoutFlag as any))
        .rejects.toThrow('includeDocumentAttachments is required');
      await expect(service.sendInvoice(companySlug, { ...validSend(), invoiceId: undefined as any }))
        .rejects.toThrow('invoiceId is required');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('invoice drafts', () => {
    it('lists drafts with query params', async () => {
      mockSuccessResponse([]);

      await service.getInvoiceDrafts(companySlug, { pageSize: 10, uuid: '123e4567-e89b-12d3-a456-426655440000' });

      expect(lastCall().url).toBe(
        `${baseUrl}/companies/${companySlug}/invoices/drafts?pageSize=10&uuid=123e4567-e89b-12d3-a456-426655440000`
      );
    });

    it('creates a draft and exposes the Location header', async () => {
      mockSuccessResponse(undefined, 201, { Location: `${baseUrl}/companies/${companySlug}/invoices/drafts/9` });

      const result = await service.createInvoiceDraft(companySlug, validDraft());

      const { url, method, body } = lastCall();
      expect(method).toBe('POST');
      expect(url).toBe(`${baseUrl}/companies/${companySlug}/invoices/drafts`);
      expect(body).toEqual(validDraft());
      expect(result.location).toMatch(/drafts\/9$/);
    });

    it.each([
      ['type', 'type is required'],
      ['customerId', 'customerId is required'],
      ['daysUntilDueDate', 'daysUntilDueDate is required'],
    ] as const)('requires %s', async (field, message) => {
      const draft: any = validDraft();
      delete draft[field];

      await expect(service.createInvoiceDraft(companySlug, draft)).rejects.toThrow(message);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('allows a draft without lines', async () => {
      mockSuccessResponse(undefined, 201);
      const { lines, ...draft } = validDraft();

      await expect(service.createInvoiceDraft(companySlug, draft)).resolves.toBeDefined();
    });

    it('requires startDate for a repeating_invoice draft and a valid frequency', async () => {
      await expect(service.createInvoiceDraft(companySlug, { ...validDraft(), type: 'repeating_invoice' }))
        .rejects.toThrow('startDate is required');
      await expect(service.createInvoiceDraft(companySlug, {
        ...validDraft(),
        frequency: { interval: 0, intervalUnit: 'MONTH' },
      })).rejects.toThrow('frequency needs');
    });

    it('accepts RAW_FISH on draft lines', async () => {
      mockSuccessResponse(undefined, 201);

      await expect(service.createInvoiceDraft(companySlug, {
        ...validDraft(),
        lines: [{ quantity: 1, vatType: 'RAW_FISH' }],
      })).resolves.toBeDefined();
    });

    it('uses the draft endpoints for get, update and delete', async () => {
      mockSuccessResponse({ draftId: 9 });
      await service.getInvoiceDraft(companySlug, 9);
      expect(lastCall()).toMatchObject({ method: 'GET', url: `${baseUrl}/companies/${companySlug}/invoices/drafts/9` });

      mockSuccessResponse(undefined, 201);
      await service.updateInvoiceDraft(companySlug, 9, validDraft());
      expect(lastCall()).toMatchObject({ method: 'PUT', url: `${baseUrl}/companies/${companySlug}/invoices/drafts/9` });

      mockSuccessResponse(undefined, 204);
      await service.deleteInvoiceDraft(companySlug, 9);
      expect(lastCall()).toMatchObject({ method: 'DELETE', url: `${baseUrl}/companies/${companySlug}/invoices/drafts/9` });
    });
  });

  describe('creating from drafts', () => {
    it('posts to createInvoice without a body and exposes the new invoice location', async () => {
      mockSuccessResponse(undefined, 201, { Location: `${baseUrl}/companies/${companySlug}/invoices/56` });

      const result = await service.createInvoiceFromDraft(companySlug, 9);

      expect(lastCall()).toEqual({
        method: 'POST',
        url: `${baseUrl}/companies/${companySlug}/invoices/drafts/9/createInvoice`,
        body: undefined,
      });
      expect(result.location).toMatch(/invoices\/56$/);
    });

    it('posts to createRecurringInvoice', async () => {
      mockSuccessResponse(undefined, 201);

      await service.createRecurringInvoiceFromDraft(companySlug, 9);

      expect(lastCall()).toMatchObject({
        method: 'POST',
        url: `${baseUrl}/companies/${companySlug}/invoices/drafts/9/createRecurringInvoice`,
      });
    });

    it('validates the draft id and company slug', async () => {
      await expect(service.createInvoiceFromDraft(companySlug, -1)).rejects.toThrow('draftId is required');
      await expect(service.createRecurringInvoiceFromDraft('../x', 9)).rejects.toThrow('Company slug may only contain');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('counter and attachments', () => {
    it('uses the counter and attachments endpoints', async () => {
      mockSuccessResponse({ value: 10000 });
      await service.getInvoiceCounter(companySlug);
      expect(lastCall().url).toBe(`${baseUrl}/companies/${companySlug}/invoices/counter`);

      mockSuccessResponse(undefined, 201);
      await service.createInvoiceCounter(companySlug, { value: 20000 });
      expect(lastCall()).toMatchObject({ method: 'POST', body: { value: 20000 } });
      await expect(service.createInvoiceCounter(companySlug, { value: 1.5 })).rejects.toThrow('must be an integer');

      mockSuccessResponse([]);
      await service.getInvoiceAttachments(companySlug, 7);
      expect(lastCall().url).toBe(`${baseUrl}/companies/${companySlug}/invoices/7/attachments`);

      mockSuccessResponse([]);
      await service.getInvoiceDraftAttachments(companySlug, 9);
      expect(lastCall().url).toBe(`${baseUrl}/companies/${companySlug}/invoices/drafts/9/attachments`);
    });
  });
});
