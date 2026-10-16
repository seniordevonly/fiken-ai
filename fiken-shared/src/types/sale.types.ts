/**
 * Fiken Sales (salg) and their drafts, attachments and payments types, following the v2 OpenAPI spec
 * (swagger/swagger.yaml). All amounts are integer cents (øre) unless noted otherwise.
 */

import { SalesVatType } from './invoice.types';
import { Attachment, Contact, OrderLine, Payment, ProjectResult } from './shared.types';

export type SaleKind = 'cash_sale' | 'invoice' | 'external_invoice';

// Order line of a sale (spec: orderLine); projectId is for purchases only
export interface SaleLine extends Omit<OrderLine, 'vatType' | 'projectId'> {
  vatType: SalesVatType;
}

// Sale Request interface (spec: saleRequest). For sales whose invoice was made outside Fiken ("annet salg")
export interface SaleRequest {
  saleNumber?: string;
  date: string; // format: yyyy-mm-dd
  kind: SaleKind;
  totalPaid?: number; // in cents, NOK
  totalPaidInCurrency?: number; // in cents, in the sale currency
  lines: SaleLine[];
  customerId?: number; // contactId of a customer
  currency: string; // ISO 4217 currency code
  dueDate?: string; // format: yyyy-mm-dd
  kid?: string; // Norwegian KID number, 2 to 25 digits
  paymentAccount?: string; // e.g. '1920:10001'
  paymentDate?: string; // format: yyyy-mm-dd
  paymentFee?: number; // in cents
  projectId?: number;
}

export interface SaleNote {
  author?: string;
  note?: string;
}

// Sale Result interface (spec: saleResult; its writeOnly paymentAccount is never returned)
export interface SaleResult {
  saleId: number;
  lastModifiedDate?: string; // format: yyyy-mm-dd
  transactionId?: number;
  saleNumber?: string;
  date: string; // format: yyyy-mm-dd
  kind: SaleKind;
  netAmount?: number; // in cents
  vatAmount?: number; // in cents
  settled?: boolean;
  settledDate?: string; // format: yyyy-mm-dd
  writeOff?: boolean; // a loss has been registered (tapsføring)
  totalPaid?: number; // in cents, NOK
  totalPaidInCurrency?: number; // in cents, in the sale currency
  outstandingBalance?: number; // in cents, NOK
  outstandingBalanceInCurrency?: number; // in cents, in the sale currency
  lines: SaleLine[];
  customer?: Contact;
  currency: string; // ISO 4217 currency code
  dueDate?: string; // format: yyyy-mm-dd
  kid?: string;
  salePayments?: Payment[];
  saleAttachments?: Attachment[];
  paymentDate?: string; // format: yyyy-mm-dd
  project?: ProjectResult;
  notes?: SaleNote[];
  deleted?: boolean;
}

// Query parameters for GET /sales (dates are yyyy-mm-dd)
export interface SaleQueryParams {
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
  saleNumber?: string;
  settled?: boolean; // true: only settled sales; false: those not fully settled
  contactId?: number;
}

// Sale draft line (spec: draftLineRequest, with the sales VAT types)
export interface SaleDraftLineRequest {
  text: string; // maxLength: 200
  vatType: SalesVatType;
  incomeAccount: string; // account code, e.g. '3000'
  net: number; // net amount in cents, in the draft currency
  gross: number; // gross amount (net + VAT) in cents, in the draft currency
  projectId?: number;
}

// Spec: draftLineResult
export interface SaleDraftLineResult {
  text?: string;
  vatType?: SalesVatType;
  incomeAccount?: string;
  net?: number; // in cents
  gross?: number; // in cents
  project?: ProjectResult;
}

// Sale draft request (spec: draftRequest)
export interface SaleDraftRequest {
  invoiceIssueDate?: string; // format: yyyy-mm-dd
  dueDate?: string; // format: yyyy-mm-dd
  invoiceNumber?: string; // invoice number made outside Fiken
  contactId?: number;
  projectId?: number;
  cash: boolean;
  currency?: string; // ISO 4217 currency code
  kid?: string;
  paid: boolean;
  payments?: Payment[];
  lines: SaleDraftLineRequest[];
}

// Sale draft result (spec: draftResult)
export interface SaleDraftResult {
  draftId: number;
  uuid?: string;
  invoiceIssueDate?: string; // format: yyyy-mm-dd
  dueDate?: string; // format: yyyy-mm-dd
  invoiceNumber?: string;
  contact?: Contact;
  project?: ProjectResult;
  cash: boolean;
  currency?: string;
  kid?: string;
  paid?: boolean;
  attachments?: Attachment[];
  payments?: Payment[];
  lines: SaleDraftLineResult[];
}

// Query parameters for GET /sales/drafts
export interface SaleDraftQueryParams {
  page?: number;
  pageSize?: number;
}

// Accounts a sale line can be accrued to (accrualRequest.account)
export type SaleAccrualAccount = '1530' | '2965';

// Spreads one sale line over monthly periods (spec: accrualRequest)
export interface SaleAccrualRequest {
  lineId: number; // orderLine.lineId from GET sale; must be on a result account (3000-7999)
  startDate: string; // first period, format: yyyy-mm-dd
  periods: number; // 1-120 months
  account: SaleAccrualAccount; // required by Fiken although the spec doesn't list it as required
}

// Spec: accrualResult
export interface SaleAccrualResult {
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
