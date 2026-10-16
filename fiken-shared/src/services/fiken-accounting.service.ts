/**
 * Fiken Accounting Service - accounts, account balances, bank accounts/balances, journal entries and transactions
 */

import { FikenBaseService, FikenConfig } from './fiken-base.service';
import {
  Account,
  AccountBalance,
  AccountBalanceQueryParams,
  AccountQueryParams,
  Attachment,
  BankAccountQueryParams,
  BankAccountRequest,
  BankAccountResult,
  BankBalanceQueryParams,
  BankBalanceResult,
  FikenApiResponse,
  GeneralJournalEntryRequest,
  JournalEntry,
  JournalEntryQueryParams,
  Transaction,
  TransactionQueryParams
} from '../types/fiken.types';

const ACCOUNT_CODE = /^\d{4}(:\d{5})?$/;

export class FikenAccountingService extends FikenBaseService {
  constructor(config: FikenConfig) {
    super(config);
  }

  // ========== ACCOUNT OPERATIONS ==========

  /**
   * Get the bookkeeping accounts for the current year
   * GET /companies/{companySlug}/accounts
   */
  async getAccounts(
    companySlug: string,
    params?: AccountQueryParams
  ): Promise<FikenApiResponse<Account[]>> {
    this.validateCompanySlug(companySlug);

    return this.get<Account[]>(`/companies/${companySlug}/accounts`, params);
  }

  /**
   * Get a bookkeeping account, e.g. '3020' or '1500:10001'
   * GET /companies/{companySlug}/accounts/{accountCode}
   */
  async getAccount(
    companySlug: string,
    accountCode: string
  ): Promise<FikenApiResponse<Account>> {
    this.validateCompanySlug(companySlug);
    this.validateAccountCode(accountCode);

    return this.get<Account>(`/companies/${companySlug}/accounts/${accountCode}`);
  }

  /**
   * Get accounts with their closing balances on a date
   * GET /companies/{companySlug}/accountBalances
   */
  async getAccountBalances(
    companySlug: string,
    params: AccountBalanceQueryParams
  ): Promise<FikenApiResponse<AccountBalance[]>> {
    this.validateCompanySlug(companySlug);
    this.validateRequiredDate(params?.date);

    return this.get<AccountBalance[]>(`/companies/${companySlug}/accountBalances`, params);
  }

  /**
   * Get one account with its closing balance on a date
   * GET /companies/{companySlug}/accountBalances/{accountCode}
   */
  async getAccountBalance(
    companySlug: string,
    accountCode: string,
    date: string
  ): Promise<FikenApiResponse<AccountBalance>> {
    this.validateCompanySlug(companySlug);
    this.validateAccountCode(accountCode);
    this.validateRequiredDate(date);

    return this.get<AccountBalance>(`/companies/${companySlug}/accountBalances/${accountCode}`, { date });
  }

  // ========== BANK ACCOUNT OPERATIONS ==========

  /**
   * Get bank accounts (active ones unless params.inactive is true)
   * GET /companies/{companySlug}/bankAccounts
   */
  async getBankAccounts(
    companySlug: string,
    params?: BankAccountQueryParams
  ): Promise<FikenApiResponse<BankAccountResult[]>> {
    this.validateCompanySlug(companySlug);

    return this.get<BankAccountResult[]>(`/companies/${companySlug}/bankAccounts`, params);
  }

  /**
   * Create a bank account; the Location header holds the new account's URL
   * POST /companies/{companySlug}/bankAccounts
   */
  async createBankAccount(
    companySlug: string,
    bankAccount: BankAccountRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    if (!bankAccount?.name || !bankAccount.bankAccountNumber || !bankAccount.type) {
      throw new Error('Bank account name, bankAccountNumber and type are required');
    }

    return this.post<void>(`/companies/${companySlug}/bankAccounts`, bankAccount);
  }

  /**
   * Get a bank account
   * GET /companies/{companySlug}/bankAccounts/{bankAccountId}
   */
  async getBankAccount(
    companySlug: string,
    bankAccountId: number
  ): Promise<FikenApiResponse<BankAccountResult>> {
    this.validateCompanySlug(companySlug);
    this.validateId(bankAccountId, 'bankAccountId');

    return this.get<BankAccountResult>(`/companies/${companySlug}/bankAccounts/${bankAccountId}`);
  }

  /**
   * Get bank balances per bank account
   * GET /companies/{companySlug}/bankBalances
   */
  async getBankBalances(
    companySlug: string,
    params?: BankBalanceQueryParams
  ): Promise<FikenApiResponse<BankBalanceResult[]>> {
    this.validateCompanySlug(companySlug);

    return this.get<BankBalanceResult[]>(`/companies/${companySlug}/bankBalances`, params);
  }

  // ========== JOURNAL ENTRY OPERATIONS ==========

  /**
   * Get journal entries (posteringer)
   * GET /companies/{companySlug}/journalEntries
   */
  async getJournalEntries(
    companySlug: string,
    params?: JournalEntryQueryParams
  ): Promise<FikenApiResponse<JournalEntry[]>> {
    this.validateCompanySlug(companySlug);

    return this.get<JournalEntry[]>(`/companies/${companySlug}/journalEntries`, params);
  }

  /**
   * Get a journal entry
   * GET /companies/{companySlug}/journalEntries/{journalEntryId}
   */
  async getJournalEntry(
    companySlug: string,
    journalEntryId: number
  ): Promise<FikenApiResponse<JournalEntry>> {
    this.validateCompanySlug(companySlug);
    this.validateId(journalEntryId, 'journalEntryId');

    return this.get<JournalEntry>(`/companies/${companySlug}/journalEntries/${journalEntryId}`);
  }

  /**
   * Get the attachments of a journal entry
   * GET /companies/{companySlug}/journalEntries/{journalEntryId}/attachments
   */
  async getJournalEntryAttachments(
    companySlug: string,
    journalEntryId: number
  ): Promise<FikenApiResponse<Attachment[]>> {
    this.validateCompanySlug(companySlug);
    this.validateId(journalEntryId, 'journalEntryId');

    return this.get<Attachment[]>(`/companies/${companySlug}/journalEntries/${journalEntryId}/attachments`);
  }

  /**
   * Create a general journal entry (fri postering); the Location header holds the new entry's URL
   * POST /companies/{companySlug}/generalJournalEntries
   */
  async createGeneralJournalEntry(
    companySlug: string,
    entry: GeneralJournalEntryRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateGeneralJournalEntry(entry);

    return this.post<void>(`/companies/${companySlug}/generalJournalEntries`, entry);
  }

  // ========== TRANSACTION OPERATIONS ==========

  /**
   * Get transactions
   * GET /companies/{companySlug}/transactions
   */
  async getTransactions(
    companySlug: string,
    params?: TransactionQueryParams
  ): Promise<FikenApiResponse<Transaction[]>> {
    this.validateCompanySlug(companySlug);

    return this.get<Transaction[]>(`/companies/${companySlug}/transactions`, params);
  }

  /**
   * Get a transaction; its id is returned on sales, purchases and journal entries
   * GET /companies/{companySlug}/transactions/{transactionId}
   */
  async getTransaction(
    companySlug: string,
    transactionId: number
  ): Promise<FikenApiResponse<Transaction>> {
    this.validateCompanySlug(companySlug);
    this.validateId(transactionId, 'transactionId');

    return this.get<Transaction>(`/companies/${companySlug}/transactions/${transactionId}`);
  }

  // ========== VALIDATION METHODS ==========

  /**
   * The account code is interpolated into the path, so only the documented formats are allowed
   */
  private validateAccountCode(accountCode: string): void {
    if (typeof accountCode !== 'string' || !ACCOUNT_CODE.test(accountCode)) {
      throw new Error('accountCode must be four digits, optionally followed by a colon and five digits (e.g. 3020 or 1500:10001)');
    }
  }

  private validateRequiredDate(date: string | undefined): void {
    if (!date || !this.isValidDate(date)) {
      throw new Error('date is required in YYYY-MM-DD format');
    }
  }

  private validateGeneralJournalEntry(entry: GeneralJournalEntryRequest): void {
    if (!entry || !Array.isArray(entry.journalEntries) || entry.journalEntries.length === 0) {
      throw new Error('journalEntries is required and must be a non-empty array');
    }

    entry.journalEntries.forEach((journalEntry, index) => {
      const label = `Journal entry ${index + 1}`;
      if (!journalEntry.description) {
        throw new Error(`${label}: description is required`);
      }
      if (!journalEntry.date || !this.isValidDate(journalEntry.date)) {
        throw new Error(`${label}: date is required in YYYY-MM-DD format`);
      }
      if (!Array.isArray(journalEntry.lines) || journalEntry.lines.length === 0) {
        throw new Error(`${label}: lines are required and must be a non-empty array`);
      }
      journalEntry.lines.forEach((line, lineIndex) => {
        if (!Number.isInteger(line.amount)) {
          throw new Error(`${label}, line ${lineIndex + 1}: amount is required and must be an integer number of cents`);
        }
        if (!line.debitAccount && !line.creditAccount) {
          throw new Error(`${label}, line ${lineIndex + 1}: debitAccount or creditAccount is required`);
        }
      });
    });
  }
}
