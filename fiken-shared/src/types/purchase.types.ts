/**
 * Fiken purchase and purchase draft types, following the v2 OpenAPI spec (swagger/swagger.yaml).
 * All amounts are integer cents (øre) unless noted otherwise.
 */

import { Attachment, Contact, OrderLine, Payment, ProjectResult, PurchaseVatType } from './shared.types';

export type PurchaseKind = 'cash_purchase' | 'supplier';

export type PurchaseSortBy = 'date asc' | 'date desc';

// Purchase Request interface (spec: purchaseRequest)
export interface PurchaseRequest {
  identifier?: string; // invoice/sale number or similar
  date: string; // format: yyyy-mm-dd
  dueDate?: string; // format: yyyy-mm-dd
  kind: PurchaseKind;
  paid: boolean;
  lines: OrderLine[];
  supplierId?: number; // supplier contact, if not a cash purchase
  currency: string; // ISO 4217 currency code
  paymentAccount?: string; // e.g. '1920:10001'
  paymentDate?: string; // format: yyyy-mm-dd
  paymentAmountInNok?: number; // in cents; required for a payment in a foreign currency, the NOK amount paid
  kid?: string; // Norwegian KID number, 2 to 25 digits
  projectId?: number;
}

// Purchase Result interface (spec: purchaseResult; its writeOnly fields are never returned)
export interface PurchaseResult {
  purchaseId: number;
  transactionId?: number;
  identifier?: string;
  date: string; // format: yyyy-mm-dd
  dueDate?: string; // format: yyyy-mm-dd
  kind: PurchaseKind;
  paid: boolean;
  lines: OrderLine[];
  supplier?: Contact;
  currency: string; // ISO 4217 currency code
  payments?: Payment[];
  purchaseAttachments?: Attachment[];
  project?: ProjectResult[];
  deleted?: boolean;
  settled?: boolean;
  settledDate?: string; // format: yyyy-mm-dd
}

// Draft Line Request interface (spec: draftLineRequest)
export interface DraftLineRequest {
  text: string; // maxLength: 200, description of the purchase line
  vatType: PurchaseVatType;
  incomeAccount: string; // account code, e.g. '4000'
  net: number; // net amount in cents, in the draft currency
  gross: number; // gross amount (net + VAT) in cents, in the draft currency
  projectId?: number;
}

// Draft Line Result interface (spec: draftLineResult)
export interface DraftLineResult {
  text?: string;
  vatType?: PurchaseVatType;
  incomeAccount?: string;
  net?: number; // in cents
  gross?: number; // in cents
  project?: ProjectResult;
}

// Draft Request interface (spec: draftRequest)
export interface DraftRequest {
  invoiceIssueDate?: string; // format: yyyy-mm-dd
  dueDate?: string; // format: yyyy-mm-dd
  invoiceNumber?: string;
  contactId?: number;
  projectId?: number;
  cash: boolean;
  currency?: string; // ISO 4217 currency code
  kid?: string; // Norwegian KID number
  paid: boolean;
  payments?: Payment[];
  lines: DraftLineRequest[];
}

// Draft Result interface (spec: draftResult)
export interface DraftResult {
  draftId: number;
  uuid?: string;
  invoiceIssueDate?: string; // format: yyyy-mm-dd
  dueDate?: string; // format: yyyy-mm-dd
  invoiceNumber?: string;
  contact?: Contact;
  project?: ProjectResult;
  cash: boolean;
  currency?: string; // ISO 4217 currency code
  kid?: string; // Norwegian KID number
  paid?: boolean;
  attachments?: Attachment[];
  payments?: Payment[];
  lines: DraftLineResult[];
}

// Accounts a purchase line can be accrued to (accrualRequest.account)
export type PurchaseAccrualAccount = '1397' | '1700' | '1710' | '1742' | '1743' | '1744' | '1749' | '2961';

// Spreads one purchase line over monthly periods (spec: accrualRequest)
export interface PurchaseAccrualRequest {
  lineId: number; // orderLine.lineId from GET purchase; must be on a result account (3000-7999)
  startDate: string; // first period, format: yyyy-mm-dd
  periods: number; // 1-120 months
  account: PurchaseAccrualAccount; // the spec's description says required, though its required list omits it
}

// Spec: accrualResult
export interface PurchaseAccrualResult {
  accrualId: number;
  lineId?: number;
  account?: string;
  startDate?: string; // format: yyyy-mm-dd
  periods?: number;
  amountPerPeriod?: number; // in cents
  endDate?: string; // format: yyyy-mm-dd
  unpostedPeriods?: number;
  unpostedYears?: string[];
}

// Query parameters for GET /purchases (dates are yyyy-mm-dd)
export interface PurchaseQueryParams {
  page?: number;
  pageSize?: number; // 1-100, default 25
  date?: string;
  dateLe?: string;
  dateLt?: string;
  dateGe?: string;
  dateGt?: string;
  lastModified?: string;
  lastModifiedLe?: string;
  lastModifiedLt?: string;
  lastModifiedGe?: string;
  lastModifiedGt?: string;
  sortBy?: PurchaseSortBy;
  paid?: boolean; // true: only paid purchases; false: those not fully settled
  settledDate?: string;
  settledDateLe?: string;
  settledDateLt?: string;
  settledDateGe?: string;
  settledDateGt?: string;
  contactId?: number;
}

// Query parameters for GET /purchases/drafts
export interface DraftQueryParams {
  page?: number;
  pageSize?: number;
}
