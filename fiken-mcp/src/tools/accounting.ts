/**
 * Tools for the chart of accounts, account and bank balances, bank accounts, journal entries and transactions.
 */

import { FikenAccountingService } from 'fiken-shared';
import { z } from 'zod';
import type { FikenContext } from '../context.js';
import { IdSchema } from '../schemas.js';
import { createdResult, jsonResult, listResult, paginationFrom, type ToolDefinition } from './types.js';

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');
const DetailSchema = z.enum(['summary', 'full']).default('summary');
const PageSchema = {
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
};
const dateFilters = <K extends string>(field: K) => ({
  [field]: DateSchema.optional(),
  [`${field}Le`]: DateSchema.optional(),
  [`${field}Lt`]: DateSchema.optional(),
  [`${field}Ge`]: DateSchema.optional(),
  [`${field}Gt`]: DateSchema.optional(),
}) as Record<K | `${K}${'Le' | 'Lt' | 'Ge' | 'Gt'}`, z.ZodOptional<typeof DateSchema>>;

const AccountCodeSchema = z.string().regex(
  /^\d{4}(:\d{5})?$/,
  'Account code must be four digits, optionally followed by a colon and five digits (e.g. 3020 or 1500:10001)',
);
// fromAccount/toAccount filter on the four-digit main account, without the sub-account part
const AccountNumberSchema = z.number().int().min(1000).max(9999);

const AccountQueryParamsSchema = z.object({
  ...PageSchema,
  fromAccount: AccountNumberSchema.optional(),
  toAccount: AccountNumberSchema.optional(),
  range: z.string().min(1).optional(),
});

const AccountBalanceQueryParamsSchema = z.object({
  ...PageSchema,
  date: DateSchema,
  fromAccount: AccountNumberSchema.optional(),
  toAccount: AccountNumberSchema.optional(),
});

const BankAccountQueryParamsSchema = z.object({
  ...PageSchema,
  inactive: z.boolean().optional(),
});

const BankBalanceQueryParamsSchema = z.object({
  ...PageSchema,
  date: DateSchema.optional(),
});

const BankAccountTypeEnum = z.enum(['normal', 'tax_deduction', 'foreign', 'credit_card']);

const BankAccountSchema = z.object({
  name: z.string().min(1),
  bankAccountNumber: z.string().min(1),
  type: BankAccountTypeEnum,
  bic: z.string().optional(),
  iban: z.string().optional(),
  foreignService: z.string().optional(),
  inactive: z.boolean().optional(),
}).strict().refine(account => account.foreignService === undefined || account.type === 'foreign', {
  message: 'foreignService is only allowed when type is foreign',
  path: ['foreignService'],
});

const JournalEntryQueryParamsSchema = z.object({
  ...PageSchema,
  ...dateFilters('date'),
  ...dateFilters('lastModified'),
  ...dateFilters('createdDate'),
  transactionType: z.string().min(1).optional(),
});

const TransactionQueryParamsSchema = z.object({
  ...PageSchema,
  ...dateFilters('lastModified'),
  ...dateFilters('createdDate'),
  type: z.string().min(1).optional(),
});

// Fiken prefixes API-created descriptions with this, and the prefix counts towards the 200 char limit
const DESCRIPTION_PREFIX = 'Fri postering registrert via API: ';
const JournalDescriptionSchema = z.string().min(1).max(200 - DESCRIPTION_PREFIX.length);

const JournalEntryLineSchema = z.object({
  amount: z.number().int().positive('Amount must be a positive integer number of cents'),
  debitAccount: AccountCodeSchema.optional(),
  debitVatCode: z.number().int().min(0).optional(),
  creditAccount: AccountCodeSchema.optional(),
  creditVatCode: z.number().int().min(0).optional(),
}).strict().superRefine((line, ctx) => {
  if (!line.debitAccount && !line.creditAccount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'debitAccount or creditAccount is required' });
  }
  if (line.debitVatCode !== undefined && !line.debitAccount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'debitVatCode requires debitAccount', path: ['debitVatCode'] });
  }
  if (line.creditVatCode !== undefined && !line.creditAccount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'creditVatCode requires creditAccount', path: ['creditVatCode'] });
  }
});

const JournalEntryRequestSchema = z.object({
  description: JournalDescriptionSchema,
  date: DateSchema,
  lines: z.array(JournalEntryLineSchema).min(1, 'At least one line is required'),
}).strict().superRefine((entry, ctx) => {
  // With VAT codes Fiken derives the VAT lines itself (debit amounts are net, credit amounts gross), so only
  // VAT-free entries can be checked here. A line with both accounts balances itself
  if (entry.lines.some(line => line.debitVatCode !== undefined || line.creditVatCode !== undefined)) return;
  const sum = (side: 'debitAccount' | 'creditAccount') => entry.lines
    .filter(line => !(line.debitAccount && line.creditAccount) && line[side])
    .reduce((total, line) => total + line.amount, 0);
  const debits = sum('debitAccount');
  const credits = sum('creditAccount');
  if (debits !== credits) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `debit-only lines total ${debits} cents but credit-only lines total ${credits}; they must balance`,
      path: ['lines'],
    });
  }
});

const GeneralJournalEntrySchema = z.object({
  description: JournalDescriptionSchema.optional(),
  open: z.boolean().optional(),
  journalEntries: z.array(JournalEntryRequestSchema).min(1, 'At least one journal entry is required'),
}).strict();

const companySlug = z.string().optional();

/**
 * Each tool's arguments; handlers parse with these, so errors name the field (e.g. "params.date: ..."), and the
 * tests check them against the advertised inputSchema
 */
export const accountingToolArgs = {
  fiken_get_accounts: z.object({ companySlug, params: AccountQueryParamsSchema.optional() }),
  fiken_get_account: z.object({ companySlug, accountCode: AccountCodeSchema }),
  fiken_get_account_balances: z.object({ companySlug, params: AccountBalanceQueryParamsSchema }),
  fiken_get_account_balance: z.object({ companySlug, accountCode: AccountCodeSchema, date: DateSchema }),
  fiken_get_bank_accounts: z.object({ companySlug, detail: DetailSchema, params: BankAccountQueryParamsSchema.optional() }),
  fiken_get_bank_account: z.object({ companySlug, bankAccountId: IdSchema }),
  fiken_create_bank_account: z.object({ companySlug, bankAccount: BankAccountSchema }),
  fiken_get_bank_balances: z.object({ companySlug, params: BankBalanceQueryParamsSchema.optional() }),
  fiken_get_journal_entries: z.object({ companySlug, detail: DetailSchema, params: JournalEntryQueryParamsSchema.optional() }),
  fiken_get_journal_entry: z.object({ companySlug, journalEntryId: IdSchema }),
  fiken_get_journal_entry_attachments: z.object({ companySlug, journalEntryId: IdSchema }),
  fiken_create_general_journal_entry: z.object({ companySlug, generalJournalEntry: GeneralJournalEntrySchema }),
  fiken_get_transactions: z.object({ companySlug, detail: DetailSchema, params: TransactionQueryParamsSchema.optional() }),
  fiken_get_transaction: z.object({ companySlug, transactionId: IdSchema }),
};

// Ledger amounts are NOK cents; models misread cents, so balances also carry the amount in kroner
const centsToNok = (cents: unknown) => (typeof cents === 'number' ? Math.round(cents) / 100 : undefined);

const toAccountBalanceSummary = (account: any) => ({
  code: account.code,
  name: account.name,
  balance: account.balance,
  balanceNok: centsToNok(account.balance),
});

const toBankAccountSummary = (account: any) => ({
  bankAccountId: account.bankAccountId,
  name: account.name,
  accountCode: account.accountCode,
  bankAccountNumber: account.bankAccountNumber,
  type: account.type,
  reconciledBalance: account.reconciledBalance,
  reconciledDate: account.reconciledDate,
  inactive: account.inactive,
});

const toLineSummary = (line: any) => ({ account: line.account, amount: line.amount, vatCode: line.vatCode });

// Enough to answer "what was booked to account X in March"; drops attachments and per-line project/modified data
const toJournalEntrySummary = (entry: any) => ({
  journalEntryId: entry.journalEntryId,
  journalEntryNumber: entry.journalEntryNumber,
  date: entry.date,
  description: entry.description,
  transactionId: entry.transactionId,
  transactionType: entry.transactionType,
  ...(entry.offsetTransactionId && { offsetTransactionId: entry.offsetTransactionId }),
  lines: Array.isArray(entry.lines) ? entry.lines.map(toLineSummary) : [],
  attachmentCount: Array.isArray(entry.attachments) ? entry.attachments.length : 0,
});

const toTransactionSummary = (transaction: any) => ({
  transactionId: transaction.transactionId,
  type: transaction.type,
  description: transaction.description,
  createdDate: transaction.createdDate,
  deleted: transaction.deleted,
  entries: Array.isArray(transaction.entries)
    ? transaction.entries.map((entry: any) => ({
      journalEntryId: entry.journalEntryId,
      date: entry.date,
      lines: Array.isArray(entry.lines) ? entry.lines.map(toLineSummary) : [],
    }))
    : [],
});

// ---------- JSON schemas advertised to clients (keep in sync with the zod schemas above) ----------

const companySlugProperty = {
  type: 'string',
  description: 'Company identifier slug (defaults to env FIKEN_COMPANY_SLUG if omitted)',
};

const detailProperty = (summary: string) => ({
  type: 'string',
  enum: ['summary', 'full'],
  description: `summary (default): ${summary}; full: complete Fiken records (much larger)`,
});

const pageProperties = {
  page: { type: 'number', description: 'Page number (0-based)' },
  pageSize: { type: 'number', description: 'Number of items per page (1-100, default 25)' },
};

const dateFilterProperties = (field: string, label: string) => ({
  [field]: { type: 'string', description: `Filter by exact ${label} (YYYY-MM-DD)` },
  [`${field}Le`]: { type: 'string', description: `Filter by ${label} on or before (YYYY-MM-DD)` },
  [`${field}Lt`]: { type: 'string', description: `Filter by ${label} before (YYYY-MM-DD)` },
  [`${field}Ge`]: { type: 'string', description: `Filter by ${label} on or after (YYYY-MM-DD)` },
  [`${field}Gt`]: { type: 'string', description: `Filter by ${label} after (YYYY-MM-DD)` },
});

const idProperty = (description: string) => ({ type: 'number', description });

const accountCodeProperty = {
  type: 'string',
  description: 'Account code: four digits, or four digits, a colon and five digits for a sub-account (e.g. 6540 or 1500:10001)',
};

const accountRangeProperties = {
  fromAccount: { type: 'number', description: 'Lowest four-digit account number to include, e.g. 1900' },
  toAccount: { type: 'number', description: 'Highest four-digit account number to include, e.g. 1999' },
};

const BALANCE_NOTE = 'balance is integer cents (15200 = 152.00 NOK) and balanceNok the same in kroner; positive is ' +
  'debit and negative credit, so income accounts are usually negative. For income and expense accounts (3000-8999) ' +
  'it is usually the year-to-date total.';

const AMOUNT_SIGN_NOTE = 'Line amounts are integer cents, positive for debit and negative for credit.';

const accountingService = (context: FikenContext) => context.client(FikenAccountingService);

export const accountingTools: ToolDefinition[] = [
  // ---------- accounts and balances ----------
  {
    name: 'fiken_get_accounts',
    description: 'Get the chart of accounts for the current year as {code, name}, e.g. to find the code for ' +
      '"office supplies". Sub-accounts (reskontro) look like 1500:10001; use fiken_get_account_balances for balances.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        params: {
          type: 'object',
          properties: {
            ...pageProperties,
            ...accountRangeProperties,
            range: { type: 'string', description: 'Comma-separated account numbers or ranges, e.g. "1000-1500, 2000, 7000-7004"' },
          },
        },
      },
      required: [],
    },
    handler: async (args, context) => {
      const { params } = accountingToolArgs.fiken_get_accounts.parse(args);
      const response = await accountingService(context).getAccounts(context.resolveCompanySlug(args.companySlug), params);
      return listResult('accounts', response);
    },
  },
  {
    name: 'fiken_get_account',
    description: 'Get one bookkeeping account\'s code and name. For its balance use fiken_get_account_balance.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        accountCode: accountCodeProperty,
      },
      required: ['accountCode'],
    },
    handler: async (args, context) => {
      const { accountCode } = accountingToolArgs.fiken_get_account.parse(args);
      const response = await accountingService(context).getAccount(context.resolveCompanySlug(args.companySlug), accountCode);
      return jsonResult(response.data);
    },
  },
  {
    name: 'fiken_get_account_balances',
    description: 'Get accounts with their closing balance at the end of params.date (required). Returns ' +
      `{date, pagination, accountBalances: [{code, name, balance, balanceNok}]}: ${BALANCE_NOTE} ` +
      'Use fromAccount/toAccount to narrow, e.g. 1900-1999 for bank and cash.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        params: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Balance date (YYYY-MM-DD); balances are as of the end of this day' },
            ...accountRangeProperties,
            ...pageProperties,
          },
          required: ['date'],
        },
      },
      required: ['params'],
    },
    handler: async (args, context) => {
      const { params } = accountingToolArgs.fiken_get_account_balances.parse(args);
      const response = await accountingService(context).getAccountBalances(context.resolveCompanySlug(args.companySlug), params);
      // The response doesn't say which date it is for, so echo it back
      const accountBalances = Array.isArray(response.data) ? response.data.map(toAccountBalanceSummary) : [];
      return jsonResult(
        { date: params.date, pagination: paginationFrom(response.headers), accountBalances },
        { pretty: false, items: accountBalances.length },
      );
    },
  },
  {
    name: 'fiken_get_account_balance',
    description: 'Get one account\'s closing balance at the end of a date, as {code, name, balance, balanceNok, date}: ' +
      BALANCE_NOTE,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        accountCode: accountCodeProperty,
        date: { type: 'string', description: 'Balance date (YYYY-MM-DD); the balance is as of the end of this day' },
      },
      required: ['accountCode', 'date'],
    },
    handler: async (args, context) => {
      const { accountCode, date } = accountingToolArgs.fiken_get_account_balance.parse(args);
      const response = await accountingService(context)
        .getAccountBalance(context.resolveCompanySlug(args.companySlug), accountCode, date);
      return jsonResult({ ...toAccountBalanceSummary(response.data), date });
    },
  },

  // ---------- bank accounts and balances ----------
  {
    name: 'fiken_get_bank_accounts',
    description: 'Get the company\'s bank accounts (active only unless params.inactive is true). Returns a compact ' +
      'summary per account (bankAccountId, name, accountCode = its ledger account, bankAccountNumber, type, ' +
      'reconciledBalance in integer cents as of reconciledDate, inactive) plus pagination.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        detail: detailProperty('compact fields per bank account; full adds iban, bic and foreignService'),
        params: {
          type: 'object',
          properties: {
            ...pageProperties,
            inactive: { type: 'boolean', description: 'false (default): active accounts only; true: inactive only' },
          },
        },
      },
      required: [],
    },
    handler: async (args, context) => {
      const { detail, params } = accountingToolArgs.fiken_get_bank_accounts.parse(args);
      const response = await accountingService(context).getBankAccounts(context.resolveCompanySlug(args.companySlug), params);
      return listResult('bankAccounts', response, detail === 'full' ? undefined : toBankAccountSummary);
    },
  },
  {
    name: 'fiken_get_bank_account',
    description: 'Get one bank account by bankAccountId; reconciledBalance is integer cents as of reconciledDate.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        bankAccountId: idProperty('Bank account ID (from fiken_get_bank_accounts)'),
      },
      required: ['bankAccountId'],
    },
    handler: async (args, context) => {
      const { bankAccountId } = accountingToolArgs.fiken_get_bank_account.parse(args);
      const response = await accountingService(context)
        .getBankAccount(context.resolveCompanySlug(args.companySlug), bankAccountId);
      return jsonResult(response.data);
    },
  },
  {
    name: 'fiken_create_bank_account',
    description: 'Create a bank account. Returns the new bankAccountId; fiken_get_bank_account shows its ledger accountCode.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        bankAccount: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Account name, e.g. "Driftskonto DNB"' },
            bankAccountNumber: { type: 'string', description: 'Bank account number, e.g. 15035646830' },
            type: { type: 'string', enum: BankAccountTypeEnum.options, description: 'Account type' },
            bic: { type: 'string', description: 'BIC/SWIFT code' },
            iban: { type: 'string', description: 'IBAN' },
            foreignService: { type: 'string', description: 'Name of the foreign bank; only for type foreign' },
            inactive: { type: 'boolean', description: 'Create the account as inactive (default false)' },
          },
          required: ['name', 'bankAccountNumber', 'type'],
          additionalProperties: false,
        },
      },
      required: ['bankAccount'],
    },
    handler: async (args, context) => {
      const { bankAccount } = accountingToolArgs.fiken_create_bank_account.parse(args);
      const response = await accountingService(context)
        .createBankAccount(context.resolveCompanySlug(args.companySlug), bankAccount);
      return createdResult('Bank account created', response);
    },
  },
  {
    name: 'fiken_get_bank_balances',
    description: 'Get the balance reported for each bank account, as {bankAccountId, bankAccountCode, date, amount, ' +
      'source} with amount in integer cents (250000 = 2500.00) on the given date. For the balance booked in the ledger, ' +
      'use fiken_get_account_balance with the bankAccountCode.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        params: {
          type: 'object',
          properties: {
            ...pageProperties,
            date: { type: 'string', description: 'Balance date (YYYY-MM-DD)' },
          },
        },
      },
      required: [],
    },
    handler: async (args, context) => {
      const { params } = accountingToolArgs.fiken_get_bank_balances.parse(args);
      const response = await accountingService(context).getBankBalances(context.resolveCompanySlug(args.companySlug), params);
      return listResult('bankBalances', response);
    },
  },

  // ---------- journal entries ----------
  {
    name: 'fiken_get_journal_entries',
    description: 'Get journal entries (posteringer), e.g. with params.dateGe/dateLe for a period. Returns a compact ' +
      'summary per entry (journalEntryId, journalEntryNumber, date, description, transactionId, transactionType, ' +
      `lines {account, amount, vatCode}, attachmentCount) plus pagination. ${AMOUNT_SIGN_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        detail: detailProperty('compact fields per entry; full adds attachments and per-line project ids'),
        params: {
          type: 'object',
          properties: {
            ...pageProperties,
            ...dateFilterProperties('date', 'entry date'),
            ...dateFilterProperties('lastModified', 'last modified date'),
            ...dateFilterProperties('createdDate', 'created date'),
            transactionType: {
              type: 'string',
              description: 'Exact transaction type, e.g. Fri, Salg, Kjøp, Lønn, Mva-oppgjør or Inngående balanse',
            },
          },
        },
      },
      required: [],
    },
    handler: async (args, context) => {
      const { detail, params } = accountingToolArgs.fiken_get_journal_entries.parse(args);
      const response = await accountingService(context).getJournalEntries(context.resolveCompanySlug(args.companySlug), params);
      return listResult('journalEntries', response, detail === 'full' ? undefined : toJournalEntrySummary);
    },
  },
  {
    name: 'fiken_get_journal_entry',
    description: `Get one journal entry by journalEntryId, with its lines and attachments. ${AMOUNT_SIGN_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        journalEntryId: idProperty('Journal entry ID (from fiken_get_journal_entries)'),
      },
      required: ['journalEntryId'],
    },
    handler: async (args, context) => {
      const { journalEntryId } = accountingToolArgs.fiken_get_journal_entry.parse(args);
      const response = await accountingService(context)
        .getJournalEntry(context.resolveCompanySlug(args.companySlug), journalEntryId);
      return jsonResult(response.data);
    },
  },
  {
    name: 'fiken_get_journal_entry_attachments',
    description: 'List the attachments (receipts, invoices) of a journal entry, with filename and downloadUrl.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        journalEntryId: idProperty('Journal entry ID'),
      },
      required: ['journalEntryId'],
    },
    handler: async (args, context) => {
      const { journalEntryId } = accountingToolArgs.fiken_get_journal_entry_attachments.parse(args);
      const response = await accountingService(context)
        .getJournalEntryAttachments(context.resolveCompanySlug(args.companySlug), journalEntryId);
      return listResult('attachments', response);
    },
  },
  {
    name: 'fiken_create_general_journal_entry',
    description: 'Create a general journal entry (fri postering); this posts real bookkeeping, so confirm accounts ' +
      'and amounts first. Each line books a positive amount in integer cents to debitAccount and/or creditAccount; ' +
      'a line with both balances itself, otherwise debit-only and credit-only lines must total the same. Returns ' +
      'the new id; use fiken_get_accounts to find account codes.',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        generalJournalEntry: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description: `Overall description (max ${200 - DESCRIPTION_PREFIX.length} chars; Fiken adds a prefix)`,
            },
            open: {
              type: 'boolean',
              description: 'true: the entry can later be deleted without a reversing transaction (default false)',
            },
            journalEntries: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                properties: {
                  description: {
                    type: 'string',
                    description: `What the entry is for (max ${200 - DESCRIPTION_PREFIX.length} chars; Fiken adds a prefix)`,
                  },
                  date: { type: 'string', description: 'Booking date (YYYY-MM-DD)' },
                  lines: {
                    type: 'array',
                    minItems: 1,
                    items: {
                      type: 'object',
                      properties: {
                        amount: {
                          type: 'number',
                          description: 'Positive integer cents (310000 = 3100.00); net of VAT on debitAccount, ' +
                            'gross incl. VAT on creditAccount',
                        },
                        debitAccount: { ...accountCodeProperty, description: `Account to debit. ${accountCodeProperty.description}` },
                        debitVatCode: { type: 'number', description: 'VAT code for the debit side, e.g. 1 (input VAT 25%); omit for none' },
                        creditAccount: { ...accountCodeProperty, description: `Account to credit. ${accountCodeProperty.description}` },
                        creditVatCode: { type: 'number', description: 'VAT code for the credit side, e.g. 3 (output VAT 25%); omit for none' },
                      },
                      required: ['amount'],
                      additionalProperties: false,
                    },
                  },
                },
                required: ['description', 'date', 'lines'],
                additionalProperties: false,
              },
            },
          },
          required: ['journalEntries'],
          additionalProperties: false,
        },
      },
      required: ['generalJournalEntry'],
    },
    handler: async (args, context) => {
      const { generalJournalEntry } = accountingToolArgs.fiken_create_general_journal_entry.parse(args);
      const response = await accountingService(context)
        .createGeneralJournalEntry(context.resolveCompanySlug(args.companySlug), generalJournalEntry);
      return createdResult('General journal entry created', response);
    },
  },

  // ---------- transactions ----------
  {
    name: 'fiken_get_transactions',
    description: 'Get transactions (a sale, purchase or journal posting with all its entries). Returns a compact ' +
      'summary per transaction (transactionId, type, description, createdDate, deleted, entries with lines) plus ' +
      `pagination; to filter by booking date use fiken_get_journal_entries. ${AMOUNT_SIGN_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        detail: detailProperty('compact fields per transaction; full returns complete journal entries'),
        params: {
          type: 'object',
          properties: {
            ...pageProperties,
            ...dateFilterProperties('lastModified', 'last modified date'),
            ...dateFilterProperties('createdDate', 'created date'),
            type: { type: 'string', description: 'Exact transaction type, e.g. Fri, Salg, Kjøp, Lønn or Mva-oppgjør' },
          },
        },
      },
      required: [],
    },
    handler: async (args, context) => {
      const { detail, params } = accountingToolArgs.fiken_get_transactions.parse(args);
      const response = await accountingService(context).getTransactions(context.resolveCompanySlug(args.companySlug), params);
      return listResult('transactions', response, detail === 'full' ? undefined : toTransactionSummary);
    },
  },
  {
    name: 'fiken_get_transaction',
    description: 'Get one transaction by transactionId (as found on sales, purchases and journal entries), with its ' +
      `journal entries. ${AMOUNT_SIGN_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: companySlugProperty,
        transactionId: idProperty('Transaction ID'),
      },
      required: ['transactionId'],
    },
    handler: async (args, context) => {
      const { transactionId } = accountingToolArgs.fiken_get_transaction.parse(args);
      const response = await accountingService(context)
        .getTransaction(context.resolveCompanySlug(args.companySlug), transactionId);
      return jsonResult(response.data);
    },
  },
];
