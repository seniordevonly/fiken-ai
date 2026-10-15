/**
 * Unit tests for FikenSaleService
 */

import { FikenSaleService } from '../fiken-sale.service';
import { SaleDraftRequest, SaleRequest } from '../../types/fiken.types';

global.fetch = jest.fn();

describe('FikenSaleService', () => {
  let service: FikenSaleService;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  const companySlug = 'test-company';
  const base = `https://api.fiken.no/api/v2/companies/${companySlug}`;

  beforeEach(() => {
    mockFetch = fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockReset();
    service = new FikenSaleService({ apiToken: 'test-token', enableLogging: false });
  });

  const mockResponse = (data: any, status = 200, extraHeaders: Record<string, string> = {}) => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'content-length': data === undefined ? '0' : '100',
      ...extraHeaders,
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status,
      json: async () => data,
      text: async () => JSON.stringify(data),
      headers: { get: (name: string) => headers[name] ?? null },
    } as unknown as Response);
  };

  const lastCall = () => {
    const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    return { url: String(url), method: init?.method, body: init?.body ? JSON.parse(init.body as string) : undefined };
  };

  const sale: SaleRequest = {
    date: '2026-01-15',
    kind: 'external_invoice',
    currency: 'NOK',
    lines: [{ description: 'Consulting', vatType: 'HIGH', netPrice: 100000, vat: 25000 }],
  };

  const draft: SaleDraftRequest = {
    cash: false,
    paid: false,
    lines: [{ text: 'Consulting', vatType: 'HIGH', incomeAccount: '3000', net: 100000, gross: 125000 }],
  };

  describe('sales', () => {
    it('lists sales with query parameters and pagination headers', async () => {
      mockResponse([{ saleId: 1 }], 200, {
        'Fiken-Api-Page': '0',
        'Fiken-Api-Page-Size': '25',
        'Fiken-Api-Page-Count': '1',
        'Fiken-Api-Result-Count': '1',
      });

      const result = await service.getSales(companySlug, { settled: false, contactId: 7, pageSize: 25 });

      expect(lastCall()).toMatchObject({ url: `${base}/sales?settled=false&contactId=7&pageSize=25`, method: 'GET' });
      expect(result.data).toEqual([{ saleId: 1 }]);
      expect(result.headers?.['Fiken-Api-Result-Count']).toBe(1);
    });

    it('creates a sale and returns the Location of the new sale', async () => {
      mockResponse(undefined, 201, { Location: `${base}/sales/42` });

      const result = await service.createSale(companySlug, sale);

      expect(lastCall()).toEqual({ url: `${base}/sales`, method: 'POST', body: sale });
      expect(result.location).toBe(`${base}/sales/42`);
    });

    it('requires an amount on each sale line', async () => {
      const withoutAmount = { ...sale, lines: [{ description: 'x', vatType: 'HIGH' as const }] };

      await expect(service.createSale(companySlug, withoutAmount))
        .rejects.toThrow('Line 1: Either netPrice or netPriceInCurrency is required');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('gets a sale, its attachments and payments', async () => {
      mockResponse({ saleId: 5 });
      await service.getSale(companySlug, 5);
      expect(lastCall()).toMatchObject({ url: `${base}/sales/5`, method: 'GET' });

      mockResponse([]);
      await service.getSaleAttachments(companySlug, 5);
      expect(lastCall().url).toBe(`${base}/sales/5/attachments`);

      mockResponse({ paymentId: 9 });
      await service.getSalePayment(companySlug, 5, 9);
      expect(lastCall().url).toBe(`${base}/sales/5/payments/9`);
    });
  });

  describe('payments and accruals', () => {
    it('posts a payment to the sale', async () => {
      const payment = { date: '2026-01-20', account: '1920:10001', amount: 125000 };
      mockResponse(undefined, 201, { Location: `${base}/sales/5/payments/3` });

      await service.createSalePayment(companySlug, 5, payment);

      expect(lastCall()).toEqual({ url: `${base}/sales/5/payments`, method: 'POST', body: payment });
    });

    it('rejects a payment amount that is not whole cents', async () => {
      await expect(service.createSalePayment(companySlug, 5, { date: '2026-01-20', account: '1920', amount: 12.5 }))
        .rejects.toThrow('Payment amount is required and must be an integer number of cents');
    });

    it('posts an accrual and validates its periods', async () => {
      const accrual = { lineId: 11, startDate: '2026-01-01', periods: 12, account: '2965' as const };
      mockResponse(undefined, 201);

      await service.createSaleAccrual(companySlug, 5, accrual);
      expect(lastCall()).toEqual({ url: `${base}/sales/5/accruals`, method: 'POST', body: accrual });

      await expect(service.createSaleAccrual(companySlug, 5, { ...accrual, periods: 121 }))
        .rejects.toThrow('Accrual periods must be an integer from 1 to 120');
    });

    it('gets one accrual', async () => {
      mockResponse({ accrualId: 2 });

      await service.getSaleAccrual(companySlug, 5, 2);

      expect(lastCall()).toMatchObject({ url: `${base}/sales/5/accruals/2`, method: 'GET' });
    });
  });

  describe('drafts', () => {
    it('defaults paid to false when creating a draft', async () => {
      const { paid, ...withoutPaid } = draft;
      mockResponse(undefined, 201);

      await service.createSaleDraft(companySlug, withoutPaid as SaleDraftRequest);

      expect(lastCall()).toEqual({ url: `${base}/sales/drafts`, method: 'POST', body: { ...withoutPaid, paid: false } });
    });

    it('replaces a draft with PUT', async () => {
      mockResponse(undefined, 201);

      await service.updateSaleDraft(companySlug, 8, draft);

      expect(lastCall()).toEqual({ url: `${base}/sales/drafts/8`, method: 'PUT', body: draft });
    });

    it('creates a sale from a draft without a body', async () => {
      mockResponse(undefined, 201, { Location: `${base}/sales/77` });

      const result = await service.createSaleFromDraft(companySlug, 8);

      expect(lastCall()).toEqual({ url: `${base}/sales/drafts/8/createSale`, method: 'POST', body: undefined });
      expect(result.location).toBe(`${base}/sales/77`);
    });

    it('lists drafts and their attachments', async () => {
      mockResponse([]);
      await service.getSaleDrafts(companySlug, { page: 1 });
      expect(lastCall().url).toBe(`${base}/sales/drafts?page=1`);

      mockResponse([]);
      await service.getSaleDraftAttachments(companySlug, 8);
      expect(lastCall().url).toBe(`${base}/sales/drafts/8/attachments`);
    });
  });

  describe('validation', () => {
    it.each([0, -1, 1.5, NaN])('rejects saleId %p before calling the API', async saleId => {
      await expect(service.getSale(companySlug, saleId)).rejects.toThrow('saleId is required and must be a positive integer');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects a paymentId that could change the path', async () => {
      await expect(service.getSalePayment(companySlug, 5, '1/../2' as unknown as number))
        .rejects.toThrow('paymentId is required and must be a positive integer');
    });

    it.each(['', 'bad/slug', '../x'])('rejects company slug %p', async slug => {
      await expect(service.getSales(slug)).rejects.toThrow(/Company slug/);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
