import { describe, expect, it, vi } from 'vitest';
import type { FikenContext } from '../context.js';
import { ToolRegistry } from './registry.js';
import { accountingToolArgs, accountingTools } from './accounting.js';

const headers = {
  'Fiken-Api-Page': 0,
  'Fiken-Api-Page-Size': 25,
  'Fiken-Api-Page-Count': 1,
  'Fiken-Api-Result-Count': 1,
};

const journalEntry = {
  journalEntryId: 11,
  journalEntryNumber: 18,
  createdDate: '2024-03-16',
  lastModifiedDate: '2024-03-16',
  transactionId: 734083065,
  transactionType: 'Kjøp',
  description: 'Office chair',
  date: '2024-03-15',
  lines: [
    { account: '6540', amount: 400000, vatCode: '1', projectId: [], lastModifiedDate: '2024-03-16' },
    { account: '2710', amount: 100000, vatCode: '0', projectId: [], lastModifiedDate: '2024-03-16' },
    { account: '1920:10001', amount: -500000, vatCode: '0', projectId: [], lastModifiedDate: '2024-03-16' },
  ],
  attachments: [{ uuid: 'a1', filename: 'receipt.pdf', downloadUrl: 'https://api.fiken.no/files/a1' }],
};

const bankAccount = {
  bankAccountId: 2747365,
  name: 'Driftskonto',
  accountCode: '1920:10001',
  bankAccountNumber: '15035646830',
  iban: 'NO4915035646830',
  bic: 'DNBANOKKXXX',
  type: 'normal',
  reconciledBalance: 10050,
  reconciledDate: '2024-03-31',
  inactive: false,
};

const balancedEntry = {
  description: 'Owner deposit',
  date: '2024-03-15',
  lines: [
    { amount: 100000, debitAccount: '1920:10001' },
    { amount: 100000, creditAccount: '2050' },
  ],
};

const setup = () => {
  const service = {
    getAccounts: vi.fn().mockResolvedValue({ data: [{ code: '6540', name: 'Inventar' }], headers }),
    getAccount: vi.fn().mockResolvedValue({ data: { code: '6540', name: 'Inventar' } }),
    getAccountBalances: vi.fn().mockResolvedValue({ data: [{ code: '6540', name: 'Inventar', balance: 1234550 }], headers }),
    getAccountBalance: vi.fn().mockResolvedValue({ data: { code: '3000', name: 'Salgsinntekt', balance: -5000000 } }),
    getBankAccounts: vi.fn().mockResolvedValue({ data: [bankAccount], headers }),
    getBankAccount: vi.fn().mockResolvedValue({ data: bankAccount }),
    createBankAccount: vi.fn().mockResolvedValue({
      data: undefined,
      location: 'https://api.fiken.no/api/v2/companies/co/bankAccounts/2747366',
    }),
    getBankBalances: vi.fn().mockResolvedValue({
      data: [{ source: 'MANUAL', bankAccountId: 2747365, bankAccountCode: '1920:10001', date: '2024-03-31', amount: 250000 }],
      headers,
    }),
    getJournalEntries: vi.fn().mockResolvedValue({ data: [journalEntry], headers }),
    getJournalEntry: vi.fn().mockResolvedValue({ data: journalEntry }),
    getJournalEntryAttachments: vi.fn().mockResolvedValue({ data: journalEntry.attachments }),
    createGeneralJournalEntry: vi.fn().mockResolvedValue({
      data: undefined,
      location: 'https://api.fiken.no/api/v2/companies/co/generalJournalEntries/99',
    }),
    getTransactions: vi.fn().mockResolvedValue({
      data: [{ transactionId: 734083065, type: 'Kjøp', description: 'Office chair', createdDate: '2024-03-16', deleted: false, entries: [journalEntry] }],
      headers,
    }),
    getTransaction: vi.fn().mockResolvedValue({ data: { transactionId: 734083065, entries: [journalEntry] } }),
  };
  const context = { resolveCompanySlug: (s?: string) => s ?? 'co', client: () => service } as unknown as FikenContext;
  const call = (name: string, args: Record<string, any> = {}) => {
    const tool = accountingTools.find(t => t.name === name);
    if (!tool) throw new Error(`no tool ${name}`);
    return tool.handler(args, context);
  };
  const json = async (name: string, args?: Record<string, any>) => JSON.parse((await call(name, args)).content[0].text);
  // Through the registry, so zod failures come back as the agent sees them
  const error = async (name: string, args: Record<string, any>) => {
    const result = await new ToolRegistry(accountingTools, context).call(name, args, 'stdio');
    expect(result.isError).toBe(true);
    return result.content[0].text.replace(/^Error: /, '');
  };
  return { service, call, json, error };
};

describe('accountingTools', () => {
  it('has unique fiken_ names and no delete/send tools', () => {
    const names = accountingTools.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^fiken_[a-z_]+$/);
      expect(name).not.toMatch(/delete|send/);
    }
  });

  it('advertises exactly the top-level fields its zod schema accepts', () => {
    expect(Object.keys(accountingToolArgs).sort()).toEqual(accountingTools.map(t => t.name).sort());
    for (const tool of accountingTools) {
      const shape = accountingToolArgs[tool.name as keyof typeof accountingToolArgs].shape;
      expect(Object.keys(tool.inputSchema.properties ?? {}).sort(), tool.name).toEqual(Object.keys(shape).sort());
      for (const field of (tool.inputSchema.required as string[] | undefined) ?? []) {
        expect((shape as Record<string, any>)[field].isOptional(), `${tool.name}.${field}`).toBe(false);
      }
    }
  });

  it('advertises the same params filters as the zod schema', () => {
    const names = [
      'fiken_get_accounts', 'fiken_get_account_balances', 'fiken_get_bank_accounts', 'fiken_get_bank_balances',
      'fiken_get_journal_entries', 'fiken_get_transactions',
    ] as const;
    for (const name of names) {
      const tool = accountingTools.find(t => t.name === name)!;
      const advertised = Object.keys((tool.inputSchema.properties as any).params.properties).sort();
      const params = accountingToolArgs[name].shape.params as any;
      const zodParams = (params.isOptional() ? params.unwrap() : params).shape;
      expect(advertised, name).toEqual(Object.keys(zodParams).sort());
    }
  });

  it('advertises the same general journal entry fields as the zod schema', () => {
    const advertised = (accountingTools.find(t => t.name === 'fiken_create_general_journal_entry')!
      .inputSchema.properties as any).generalJournalEntry;
    const entry = advertised.properties.journalEntries.items;
    expect(Object.keys(advertised.properties).sort()).toEqual(['description', 'journalEntries', 'open']);
    expect(Object.keys(entry.properties).sort()).toEqual(['date', 'description', 'lines']);
    expect(Object.keys(entry.properties.lines.items.properties).sort())
      .toEqual(['amount', 'creditAccount', 'creditVatCode', 'debitAccount', 'debitVatCode']);
  });

  describe('accounts and balances', () => {
    it('lists accounts with pagination', async () => {
      const { service, json } = setup();
      expect(await json('fiken_get_accounts', { params: { fromAccount: 6000, toAccount: 6999 } })).toEqual({
        pagination: { page: 0, pageSize: 25, pageCount: 1, resultCount: 1 },
        accounts: [{ code: '6540', name: 'Inventar' }],
      });
      expect(service.getAccounts).toHaveBeenCalledWith('co', { fromAccount: 6000, toAccount: 6999 });
    });

    it('gets an account by code, including sub-accounts', async () => {
      const { service, json } = setup();
      expect(await json('fiken_get_account', { accountCode: '6540' })).toEqual({ code: '6540', name: 'Inventar' });
      await json('fiken_get_account', { accountCode: '1500:10001', companySlug: 'other' });
      expect(service.getAccount).toHaveBeenLastCalledWith('other', '1500:10001');
    });

    it('returns balances in cents and kroner, with the date', async () => {
      const { service, json } = setup();
      expect(await json('fiken_get_account_balances', { params: { date: '2024-12-31', fromAccount: 6540, toAccount: 6540 } }))
        .toEqual({
          date: '2024-12-31',
          pagination: { page: 0, pageSize: 25, pageCount: 1, resultCount: 1 },
          accountBalances: [{ code: '6540', name: 'Inventar', balance: 1234550, balanceNok: 12345.5 }],
        });
      expect(service.getAccountBalances).toHaveBeenCalledWith('co', { date: '2024-12-31', fromAccount: 6540, toAccount: 6540 });
    });

    it('gets one account balance', async () => {
      const { service, json } = setup();
      expect(await json('fiken_get_account_balance', { accountCode: '3000', date: '2024-06-30' }))
        .toEqual({ code: '3000', name: 'Salgsinntekt', balance: -5000000, balanceNok: -50000, date: '2024-06-30' });
      expect(service.getAccountBalance).toHaveBeenCalledWith('co', '3000', '2024-06-30');
    });

    it('requires the balance date', async () => {
      const { error, service } = setup();
      expect(await error('fiken_get_account_balances', {})).toBe('Invalid arguments: params: Required');
      expect(await error('fiken_get_account_balances', { params: {} })).toBe('Invalid arguments: params.date: Required');
      expect(await error('fiken_get_account_balance', { accountCode: '3000', date: '30.06.2024' }))
        .toBe('Invalid arguments: date: Date must be in YYYY-MM-DD format');
      expect(service.getAccountBalances).not.toHaveBeenCalled();
    });

    it('rejects malformed account codes', async () => {
      const { error } = setup();
      expect(await error('fiken_get_account', { accountCode: '../x' })).toMatch(/^Invalid arguments: accountCode: Account code must be/);
    });
  });

  describe('bank accounts and balances', () => {
    it('lists bank account summaries, or full records on request', async () => {
      const { json } = setup();
      const { iban, bic, foreignService, ...summary } = bankAccount as typeof bankAccount & { foreignService?: string };
      expect((await json('fiken_get_bank_accounts')).bankAccounts).toEqual([summary]);
      expect((await json('fiken_get_bank_accounts', { detail: 'full' })).bankAccounts).toEqual([bankAccount]);
    });

    it('lists bank balances', async () => {
      const { service, json } = setup();
      const result = await json('fiken_get_bank_balances', { params: { date: '2024-03-31' } });
      expect(result.bankBalances[0]).toEqual(expect.objectContaining({ bankAccountCode: '1920:10001', amount: 250000 }));
      expect(service.getBankBalances).toHaveBeenCalledWith('co', { date: '2024-03-31' });
    });

    it('creates a bank account and returns its id', async () => {
      const { service, json } = setup();
      const bankAccountRequest = { name: 'Sparekonto', bankAccountNumber: '15035646831', type: 'normal' };
      expect(await json('fiken_create_bank_account', { bankAccount: bankAccountRequest })).toEqual({
        message: 'Bank account created',
        id: 2747366,
        location: 'https://api.fiken.no/api/v2/companies/co/bankAccounts/2747366',
      });
      expect(service.createBankAccount).toHaveBeenCalledWith('co', bankAccountRequest);
    });

    it('validates the bank account type and foreignService', async () => {
      const { error } = setup();
      expect(await error('fiken_create_bank_account', { bankAccount: { name: 'x', bankAccountNumber: '1', type: 'NORMAL' } }))
        .toMatch(/^Invalid arguments: bankAccount\.type: Invalid enum value/);
      expect(await error('fiken_create_bank_account', {
        bankAccount: { name: 'x', bankAccountNumber: '1', type: 'normal', foreignService: 'Barclays' },
      })).toBe('Invalid arguments: bankAccount.foreignService: foreignService is only allowed when type is foreign');
    });
  });

  describe('journal entries', () => {
    it('lists compact journal entries', async () => {
      const { service, json } = setup();
      const result = await json('fiken_get_journal_entries', { params: { dateGe: '2024-03-01', dateLe: '2024-03-31' } });
      expect(result.journalEntries).toEqual([{
        journalEntryId: 11,
        journalEntryNumber: 18,
        date: '2024-03-15',
        description: 'Office chair',
        transactionId: 734083065,
        transactionType: 'Kjøp',
        lines: [
          { account: '6540', amount: 400000, vatCode: '1' },
          { account: '2710', amount: 100000, vatCode: '0' },
          { account: '1920:10001', amount: -500000, vatCode: '0' },
        ],
        attachmentCount: 1,
      }]);
      expect(service.getJournalEntries).toHaveBeenCalledWith('co', { dateGe: '2024-03-01', dateLe: '2024-03-31' });
    });

    it('gets a journal entry and its attachments', async () => {
      const { json } = setup();
      expect(await json('fiken_get_journal_entry', { journalEntryId: 11 })).toEqual(journalEntry);
      expect((await json('fiken_get_journal_entry_attachments', { journalEntryId: 11 })).attachments)
        .toEqual(journalEntry.attachments);
    });

    it('rejects a non-integer journal entry id', async () => {
      const { error } = setup();
      expect(await error('fiken_get_journal_entry', { journalEntryId: '11' }))
        .toBe('Invalid arguments: journalEntryId: Expected number, received string');
    });
  });

  describe('fiken_create_general_journal_entry', () => {
    it('creates the entry and returns its id', async () => {
      const { service, json } = setup();
      const generalJournalEntry = { description: 'Owner deposit', journalEntries: [balancedEntry] };
      expect(await json('fiken_create_general_journal_entry', { generalJournalEntry })).toEqual({
        message: 'General journal entry created',
        id: 99,
        location: 'https://api.fiken.no/api/v2/companies/co/generalJournalEntries/99',
      });
      expect(service.createGeneralJournalEntry).toHaveBeenCalledWith('co', generalJournalEntry);
    });

    it('accepts self-balancing lines and VAT lines without checking totals', async () => {
      const { service, call } = setup();
      await call('fiken_create_general_journal_entry', {
        generalJournalEntry: {
          journalEntries: [{
            description: 'Chair',
            date: '2024-03-15',
            lines: [
              { amount: 400000, debitAccount: '6540', debitVatCode: 1 },
              { amount: 500000, creditAccount: '1920:10001' },
              { amount: 2500, debitAccount: '7770', creditAccount: '1920:10001' },
            ],
          }],
        },
      });
      expect(service.createGeneralJournalEntry).toHaveBeenCalledTimes(1);
    });

    it('rejects unbalanced entries', async () => {
      const { error, service } = setup();
      const unbalanced = { ...balancedEntry, lines: [balancedEntry.lines[0], { amount: 90000, creditAccount: '2050' }] };
      expect(await error('fiken_create_general_journal_entry', { generalJournalEntry: { journalEntries: [unbalanced] } }))
        .toBe('Invalid arguments: generalJournalEntry.journalEntries.0.lines: debit-only lines total 100000 cents ' +
          'but credit-only lines total 90000; they must balance');
      expect(service.createGeneralJournalEntry).not.toHaveBeenCalled();
    });

    it('names the offending line field', async () => {
      const { error } = setup();
      const entry = (lines: object[]) => ({ generalJournalEntry: { journalEntries: [{ ...balancedEntry, lines }] } });

      expect(await error('fiken_create_general_journal_entry', entry([{ amount: 100 }])))
        .toBe('Invalid arguments: generalJournalEntry.journalEntries.0.lines.0: debitAccount or creditAccount is required');
      expect(await error('fiken_create_general_journal_entry', entry([{ amount: 10.5, debitAccount: '1920', creditAccount: '2050' }])))
        .toBe('Invalid arguments: generalJournalEntry.journalEntries.0.lines.0.amount: Expected integer, received float');
      expect(await error('fiken_create_general_journal_entry', entry([{ amount: -100, debitAccount: '1920', creditAccount: '2050' }])))
        .toBe('Invalid arguments: generalJournalEntry.journalEntries.0.lines.0.amount: Amount must be a positive integer number of cents');
      // The read format (signed amount on "account") must not be silently stripped
      expect(await error('fiken_create_general_journal_entry', entry([{ amount: 100, account: '1920' }])))
        .toMatch(/^Invalid arguments: generalJournalEntry\.journalEntries\.0\.lines\.0: Unrecognized key\(s\) in object: 'account'/);
    });

    it('enforces the description limit left after Fiken\'s prefix', async () => {
      const { error } = setup();
      const entry = { ...balancedEntry, description: 'x'.repeat(167) };
      expect(await error('fiken_create_general_journal_entry', { generalJournalEntry: { journalEntries: [entry] } }))
        .toMatch(/^Invalid arguments: generalJournalEntry\.journalEntries\.0\.description: String must contain at most 166/);
    });
  });

  describe('transactions', () => {
    it('lists compact transactions', async () => {
      const { json } = setup();
      expect((await json('fiken_get_transactions', { params: { type: 'Kjøp' } })).transactions).toEqual([{
        transactionId: 734083065,
        type: 'Kjøp',
        description: 'Office chair',
        createdDate: '2024-03-16',
        deleted: false,
        entries: [{
          journalEntryId: 11,
          date: '2024-03-15',
          lines: [
            { account: '6540', amount: 400000, vatCode: '1' },
            { account: '2710', amount: 100000, vatCode: '0' },
            { account: '1920:10001', amount: -500000, vatCode: '0' },
          ],
        }],
      }]);
    });

    it('gets a transaction', async () => {
      const { service, json } = setup();
      expect((await json('fiken_get_transaction', { transactionId: 734083065 })).transactionId).toBe(734083065);
      expect(service.getTransaction).toHaveBeenCalledWith('co', 734083065);
    });
  });
});
