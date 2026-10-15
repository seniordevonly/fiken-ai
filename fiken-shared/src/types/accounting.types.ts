/**
 * Fiken accounts, account balances, bank accounts/balances, journal entries and transactions types,
 * following the v2 OpenAPI spec (swagger/swagger.yaml). All amounts are integer cents (øre).
 */

import { Attachment } from './shared.types';

// ========== ACCOUNTS ==========

// A bookkeeping account: four digits, or four digits, a colon and five digits for a sub-account ("reskontro"),
// e.g. '3020' or '1500:10001'
export interface Account {
  code?: string;
  name?: string;
}

export interface AccountBalance extends Account {
  balance?: number; // in cents, closing balance on the requested date
}

export interface AccountQueryParams {
  fromAccount?: number; // four-digit account number, sub-accounts excluded
  toAccount?: number;
  range?: string; // comma-separated account numbers or ranges, e.g. '1000-1500, 2000, 7000-7004'
  page?: number;
  pageSize?: number; // 1-100
}

export interface AccountBalanceQueryParams {
  date: string; // required, format: yyyy-mm-dd
  fromAccount?: number;
  toAccount?: number;
  page?: number;
  pageSize?: number;
}

// ========== BANK ACCOUNTS AND BALANCES ==========

export type BankAccountType = 'normal' | 'tax_deduction' | 'foreign' | 'credit_card';

export interface BankAccountRequest {
  name: string;
  bankAccountNumber: string;
  type: BankAccountType;
  bic?: string;
  iban?: string;
  foreignService?: string; // only for type 'foreign'
  inactive?: boolean;
}

export interface BankAccountResult {
  bankAccountId?: number;
  name?: string;
  accountCode?: string; // the bookkeeping account, e.g. '1920:10007'
  bankAccountNumber?: string;
  iban?: string;
  bic?: string;
  foreignService?: string;
  type?: BankAccountType;
  reconciledBalance?: number; // in cents
  reconciledDate?: string; // format: yyyy-mm-dd
  inactive?: boolean;
}

export interface BankAccountQueryParams {
  page?: number;
  pageSize?: number;
  inactive?: boolean; // true: only inactive accounts; false: only active ones
}

export interface BankBalanceResult {
  source?: string; // e.g. 'MANUAL'
  bankAccountId?: number;
  bankAccountCode?: string;
  date?: string; // format: yyyy-mm-dd
  amount?: number; // in cents
}

export interface BankBalanceQueryParams {
  page?: number;
  pageSize?: number;
  date?: string; // format: yyyy-mm-dd
}

// ========== JOURNAL ENTRIES ==========

// A journal entry line as returned by GET
export interface JournalEntryLine {
  amount: number; // in cents
  account?: string;
  vatCode?: string;
  projectId?: number[];
  lastModifiedDate?: string; // format: yyyy-mm-dd
}

// A journal entry line as written by POST /generalJournalEntries; at least one of debitAccount and creditAccount
export interface JournalEntryLineRequest {
  amount: number; // in cents; net (ex VAT) for debitAccount, gross (incl VAT) for creditAccount
  debitAccount?: string;
  debitVatCode?: number;
  creditAccount?: string;
  creditVatCode?: number;
}

export interface JournalEntry {
  journalEntryId?: number;
  createdDate?: string; // format: yyyy-mm-dd
  lastModifiedDate?: string; // format: yyyy-mm-dd
  transactionId?: number;
  offsetTransactionId?: number; // set when the entry was cancelled: the balancing transaction
  transactionType?: string; // e.g. 'Fri', 'Salg', 'Kjøp', 'Inngående balanse'
  journalEntryNumber?: number;
  description: string;
  date: string; // format: yyyy-mm-dd
  lines: JournalEntryLine[];
  attachments?: Attachment[];
}

export interface JournalEntryRequest {
  description: string; // max 200 chars including the 'Fri postering registrert via API: ' prefix Fiken adds
  date: string; // format: yyyy-mm-dd
  lines: JournalEntryLineRequest[];
}

export interface GeneralJournalEntryRequest {
  description?: string; // same 200 char limit as JournalEntryRequest.description
  open?: boolean; // open entries can be deleted without a counter transaction; default false
  journalEntries: JournalEntryRequest[];
}

interface DateFilterParams {
  date?: string;
  dateLe?: string;
  dateLt?: string;
  dateGe?: string;
  dateGt?: string;
}

interface LastModifiedFilterParams {
  lastModified?: string;
  lastModifiedLe?: string;
  lastModifiedLt?: string;
  lastModifiedGe?: string;
  lastModifiedGt?: string;
}

interface CreatedDateFilterParams {
  createdDate?: string;
  createdDateLe?: string;
  createdDateLt?: string;
  createdDateGe?: string;
  createdDateGt?: string;
}

// All dates format: yyyy-mm-dd
export interface JournalEntryQueryParams extends DateFilterParams, LastModifiedFilterParams, CreatedDateFilterParams {
  page?: number;
  pageSize?: number;
  transactionType?: string; // exact match on transactionType, e.g. 'Inngående balanse'
}

// ========== TRANSACTIONS ==========

export interface Transaction {
  transactionId?: number;
  createdDate?: string; // format: yyyy-mm-dd
  lastModifiedDate?: string; // format: yyyy-mm-dd
  description?: string;
  type?: string; // same values as JournalEntry.transactionType
  entries?: JournalEntry[];
  deleted?: boolean; // true once reversed by a counter transaction
}

export interface TransactionQueryParams extends LastModifiedFilterParams, CreatedDateFilterParams {
  page?: number;
  pageSize?: number;
  type?: string; // exact match on Transaction.type
}
