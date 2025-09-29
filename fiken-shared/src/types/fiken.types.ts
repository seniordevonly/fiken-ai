/**
 * Fiken API types based on swagger schema
 */

// Base types
export type VatType = 
  // Common for both sales and purchases
  | 'NONE' | 'HIGH' | 'MEDIUM' | 'RAW_FISH' | 'LOW'
  // Sales only
  | 'EXEMPT_IMPORT_EXPORT' | 'EXEMPT' | 'OUTSIDE' | 'EXEMPT_REVERSE'
  // Purchases only
  | 'HIGH_DIRECT' | 'HIGH_BASIS' | 'MEDIUM_DIRECT' | 'MEDIUM_BASIS' | 'NONE_IMPORT_BASIS'
  | 'HIGH_FOREIGN_SERVICE_DEDUCTIBLE' | 'HIGH_FOREIGN_SERVICE_NONDEDUCTIBLE'
  | 'LOW_FOREIGN_SERVICE_DEDUCTIBLE' | 'LOW_FOREIGN_SERVICE_NONDEDUCTIBLE'
  | 'HIGH_PURCHASE_OF_EMISSIONSTRADING_OR_GOLD_DEDUCTIBLE' | 'HIGH_PURCHASE_OF_EMISSIONSTRADING_OR_GOLD_NONDEDUCTIBLE';

export type PurchaseKind = 'cash_purchase' | 'supplier';

export type SortBy = 'date asc' | 'date desc' | 'createdDate asc' | 'createdDate desc';

// Order Line interface
export interface OrderLine {
  description: string;
  netPrice?: number; // in cents
  vat?: number; // in cents
  account?: string;
  vatType: VatType;
  netPriceInCurrency?: number; // in cents
  vatInCurrency?: number; // in cents
  projectId?: number;
}

// Payment interface
export interface Payment {
  paymentId?: number;
  date: string; // format: yyyy-mm-dd
  account: string;
  amount: number; // in cents
  amountInNok?: number; // in cents
  currency?: string; // ISO 4217 currency code
  fee?: number; // in cents
}

// Contact interface (simplified)
export interface Contact {
  contactId?: number;
  name?: string;
  organizationNumber?: string;
  email?: string;
  phoneNumber?: string;
}

// Project interface (simplified)
export interface ProjectResult {
  projectId: number;
  name?: string;
  number?: string;
  description?: string;
  completed?: boolean;
}

// Attachment interface
export interface Attachment {
  identifier?: string;
  downloadUrl?: string;
  fileName?: string;
  comment?: string;
}

// Purchase Request interface
export interface PurchaseRequest {
  transactionId?: number;
  identifier?: string;
  date: string; // format: yyyy-mm-dd
  dueDate?: string; // format: yyyy-mm-dd
  kind: PurchaseKind;
  lines: OrderLine[];
  supplierId?: number;
  currency: string; // ISO 4217 currency code
  paymentAccount?: string;
  paymentDate?: string; // format: yyyy-mm-dd
  kid?: string; // Norwegian KID number
  projectId?: number;
  paid?: boolean;
}

// Purchase Result interface
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
  paymentAccount?: string;
  paymentDate?: string; // format: yyyy-mm-dd
  payments?: Payment[];
  purchaseAttachments?: Attachment[];
  kid?: string; // Norwegian KID number
  project?: ProjectResult[];
  deleted?: boolean;
  settled?: boolean;
  settledDate?: string; // format: yyyy-mm-dd
}

// Draft Line Request interface
export interface DraftLineRequest {
  text: string; // maxLength: 200, description of the sale/purchase line
  vatType: VatType;
  incomeAccount: string; // account code, e.g. '3000'
  net: number; // net amount in cents (int64)
  gross: number; // gross amount (net + VAT) in cents (int64)
  projectId?: number; // optional project ID (int64)
}

// Draft Line Result interface
export interface DraftLineResult extends DraftLineRequest {
  lineId?: number;
}

// Draft Request interface
export interface DraftRequest {
  invoiceIssueDate?: string; // format: yyyy-mm-dd
  dueDate?: string; // format: yyyy-mm-dd
  invoiceNumber?: string;
  contactId?: number;
  projectId?: number;
  cash: boolean;
  currency?: string; // ISO 4217 currency code
  kid?: string; // Norwegian KID number
  paid: boolean; // required, defaults to false if not provided
  payments?: Payment[];
  lines: DraftLineRequest[];
}

// Draft Result interface
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

// Query parameters for purchases
export interface PurchaseQueryParams {
  page?: number;
  pageSize?: number;
  date?: string; // format: yyyy-mm-dd
  dateLe?: string; // format: yyyy-mm-dd
  dateLt?: string; // format: yyyy-mm-dd
  dateGe?: string; // format: yyyy-mm-dd
  dateGt?: string; // format: yyyy-mm-dd
  sortBy?: SortBy;
  paid?: boolean;
}

// Query parameters for drafts
export interface DraftQueryParams {
  page?: number;
  pageSize?: number;
}

// Attachment upload interface
export interface AttachmentUpload {
  filename: string;
  attachToPayment?: boolean;
  attachToSale?: boolean;
  file: File | Buffer;
}

// Fiken API pagination headers
export interface FikenPaginationHeaders {
  'Fiken-Api-Page': number;
  'Fiken-Api-Page-Size': number;
  'Fiken-Api-Page-Count': number;
  'Fiken-Api-Result-Count': number;
}

// Fiken API response wrapper
export interface FikenApiResponse<T> {
  data: T;
  headers?: FikenPaginationHeaders;
}
