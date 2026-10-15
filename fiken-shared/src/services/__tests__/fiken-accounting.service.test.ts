/**
 * Unit tests for FikenAccountingService
 */

import { FikenAccountingService } from '../fiken-accounting.service';
import { GeneralJournalEntryRequest } from '../../types/fiken.types';

// Mock fetch globally
global.fetch = jest.fn();

describe('FikenAccountingService', () => {
  let service: FikenAccountingService;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  const companySlug = 'test-company';
  const baseUrl = 'https://api.fiken.no/api/v2';

  beforeEach(() => {
    mockFetch = fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockReset();

    service = new FikenAccountingService({ apiToken: 'test-token', baseUrl, enableLogging: false });
  });

  const mockSuccessResponse = (data: any, status = 200, location?: string) => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status,
      json: async () => data,
      text: async () => JSON.stringify(data),
      headers: {
        get: (name: string) => {
          if (name === 'content-type') return 'application/json';
          if (name === 'content-length') return data ? '100' : '0';
          if (name === 'Location') return location ?? null;
          return null;
        },
      },
    } as unknown as Response);
  };

  const lastCall = () => {
    const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    return { url: new URL(String(url)), init: init as RequestInit };
  };

  describe('accounts', () => {
    it('gets accounts with filters as query params', async () => {
      mockSuccessResponse([{ code: '3000', name: 'Salgsinntekt' }]);

      const result = await service.getAccounts(companySlug, { fromAccount: 3000, toAccount: 3999, pageSize: 100 });

      const { url, init } = lastCall();
      expect(init.method).toBe('GET');
      expect(url.pathname).toBe(`/api/v2/companies/${companySlug}/accounts`);
      expect(url.searchParams.get('fromAccount')).toBe('3000');
      expect(url.searchParams.get('toAccount')).toBe('3999');
      expect(url.searchParams.get('pageSize')).toBe('100');
      expect(result.data).toEqual([{ code: '3000', name: 'Salgsinntekt' }]);
    });

    it('gets one account by code', async () => {
      mockSuccessResponse({ code: '6540', name: 'Inventar' });

      await service.getAccount(companySlug, '6540');

      expect(lastCall().url.pathname).toBe(`/api/v2/companies/${companySlug}/accounts/6540`);
    });

    it('rejects malformed account codes before calling the API', async () => {
      await expect(service.getAccount(companySlug, '../contacts')).rejects.toThrow('accountCode must be four digits');
      await expect(service.getAccount(companySlug, '65400')).rejects.toThrow('accountCode must be four digits');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('account balances', () => {
    it('sends the required date', async () => {
      mockSuccessResponse([{ code: '1920', name: 'Bank', balance: 15200 }]);

      await service.getAccountBalances(companySlug, { date: '2024-03-31', fromAccount: 1900, toAccount: 1999 });

      const { url } = lastCall();
      expect(url.pathname).toBe(`/api/v2/companies/${companySlug}/accountBalances`);
      expect(url.searchParams.get('date')).toBe('2024-03-31');
    });

    it('gets one account balance with the date as a query param', async () => {
      mockSuccessResponse({ code: '6540', name: 'Inventar', balance: 500000 });

      const result = await service.getAccountBalance(companySlug, '6540', '2024-12-31');

      const { url } = lastCall();
      expect(url.pathname).toBe(`/api/v2/companies/${companySlug}/accountBalances/6540`);
      expect(url.searchParams.get('date')).toBe('2024-12-31');
      expect(result.data.balance).toBe(500000);
    });

    it('accepts sub-account codes in the path', async () => {
      mockSuccessResponse({ code: '1500:10001', name: 'Acme AS', balance: 125000 });

      await service.getAccountBalance(companySlug, '1500:10001', '2024-12-31');

      expect(lastCall().url.pathname).toBe(`/api/v2/companies/${companySlug}/accountBalances/1500:10001`);
    });

    it('requires a valid date', async () => {
      await expect(service.getAccountBalances(companySlug, { date: '' })).rejects.toThrow('date is required');
      await expect(service.getAccountBalance(companySlug, '6540', '2024-02-30')).rejects.toThrow('date is required');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('bank accounts and balances', () => {
    it('gets bank accounts', async () => {
      mockSuccessResponse([]);

      await service.getBankAccounts(companySlug, { inactive: false });

      const { url, init } = lastCall();
      expect(init.method).toBe('GET');
      expect(url.pathname).toBe(`/api/v2/companies/${companySlug}/bankAccounts`);
      expect(url.searchParams.get('inactive')).toBe('false');
    });

    it('creates a bank account and returns the Location', async () => {
      const location = `${baseUrl}/companies/${companySlug}/bankAccounts/2747365`;
      mockSuccessResponse(undefined, 201, location);
      const request = { name: 'Driftskonto', bankAccountNumber: '15035646830', type: 'normal' as const };

      const result = await service.createBankAccount(companySlug, request);

      const { url, init } = lastCall();
      expect(init.method).toBe('POST');
      expect(url.pathname).toBe(`/api/v2/companies/${companySlug}/bankAccounts`);
      expect(JSON.parse(init.body as string)).toEqual(request);
      expect(result.location).toBe(location);
    });

    it('gets a bank account by id and validates the id', async () => {
      mockSuccessResponse({ bankAccountId: 7 });

      await service.getBankAccount(companySlug, 7);
      expect(lastCall().url.pathname).toBe(`/api/v2/companies/${companySlug}/bankAccounts/7`);

      await expect(service.getBankAccount(companySlug, -1)).rejects.toThrow('bankAccountId is required');
    });

    it('gets bank balances for a date', async () => {
      mockSuccessResponse([{ bankAccountId: 7, date: '2024-03-31', amount: 250000 }]);

      await service.getBankBalances(companySlug, { date: '2024-03-31' });

      const { url } = lastCall();
      expect(url.pathname).toBe(`/api/v2/companies/${companySlug}/bankBalances`);
      expect(url.searchParams.get('date')).toBe('2024-03-31');
    });
  });

  describe('journal entries', () => {
    it('gets journal entries with date filters', async () => {
      mockSuccessResponse([]);

      await service.getJournalEntries(companySlug, { dateGe: '2024-03-01', dateLe: '2024-03-31' });

      const { url } = lastCall();
      expect(url.pathname).toBe(`/api/v2/companies/${companySlug}/journalEntries`);
      expect(url.searchParams.get('dateGe')).toBe('2024-03-01');
      expect(url.searchParams.get('dateLe')).toBe('2024-03-31');
    });

    it('gets a journal entry and its attachments', async () => {
      mockSuccessResponse({ journalEntryId: 5 });
      await service.getJournalEntry(companySlug, 5);
      expect(lastCall().url.pathname).toBe(`/api/v2/companies/${companySlug}/journalEntries/5`);

      mockSuccessResponse([]);
      await service.getJournalEntryAttachments(companySlug, 5);
      expect(lastCall().url.pathname).toBe(`/api/v2/companies/${companySlug}/journalEntries/5/attachments`);
    });

    it('creates a general journal entry', async () => {
      const location = `${baseUrl}/companies/${companySlug}/generalJournalEntries/99`;
      mockSuccessResponse(undefined, 201, location);
      const request: GeneralJournalEntryRequest = {
        description: 'Owner deposit',
        journalEntries: [{
          description: 'Owner deposit',
          date: '2024-03-15',
          lines: [{ amount: 100000, debitAccount: '1920:10001', creditAccount: '2050' }],
        }],
      };

      const result = await service.createGeneralJournalEntry(companySlug, request);

      const { url, init } = lastCall();
      expect(init.method).toBe('POST');
      expect(url.pathname).toBe(`/api/v2/companies/${companySlug}/generalJournalEntries`);
      expect(JSON.parse(init.body as string)).toEqual(request);
      expect(result.location).toBe(location);
    });

    it('rejects journal entry lines without an account', async () => {
      const request: GeneralJournalEntryRequest = {
        journalEntries: [{ description: 'x', date: '2024-03-15', lines: [{ amount: 100 }] }],
      };

      await expect(service.createGeneralJournalEntry(companySlug, request))
        .rejects.toThrow('debitAccount or creditAccount is required');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('transactions', () => {
    it('gets transactions and a transaction by id', async () => {
      mockSuccessResponse([]);
      await service.getTransactions(companySlug, { type: 'Fri' });
      expect(lastCall().url.pathname).toBe(`/api/v2/companies/${companySlug}/transactions`);
      expect(lastCall().url.searchParams.get('type')).toBe('Fri');

      mockSuccessResponse({ transactionId: 734083065 });
      await service.getTransaction(companySlug, 734083065);
      expect(lastCall().url.pathname).toBe(`/api/v2/companies/${companySlug}/transactions/734083065`);
    });

    it('validates the transaction id', async () => {
      await expect(service.getTransaction(companySlug, 1.5)).rejects.toThrow('transactionId is required');
    });
  });

  it('validates the company slug', async () => {
    await expect(service.getAccounts('')).rejects.toThrow('Company slug is required');
    await expect(service.getTransactions('bad/slug')).rejects.toThrow('Company slug may only contain');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
