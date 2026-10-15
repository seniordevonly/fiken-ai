/**
 * Fiken API types shared across resources (lines, contacts, attachments, pagination)
 */

// VAT types allowed on purchase lines (see the VAT Code table in the spec)
export type PurchaseVatType =
  | 'NONE' | 'HIGH' | 'MEDIUM' | 'RAW_FISH' | 'LOW'
  | 'HIGH_DIRECT' | 'HIGH_BASIS' | 'MEDIUM_DIRECT' | 'MEDIUM_BASIS' | 'NONE_IMPORT_BASIS'
  | 'HIGH_FOREIGN_SERVICE_DEDUCTIBLE' | 'HIGH_FOREIGN_SERVICE_NONDEDUCTIBLE'
  | 'LOW_FOREIGN_SERVICE_DEDUCTIBLE' | 'LOW_FOREIGN_SERVICE_NONDEDUCTIBLE'
  | 'HIGH_PURCHASE_OF_EMISSIONSTRADING_OR_GOLD_DEDUCTIBLE' | 'HIGH_PURCHASE_OF_EMISSIONSTRADING_OR_GOLD_NONDEDUCTIBLE';

// Every VAT type: the purchase ones plus those valid for sales only
export type VatType = PurchaseVatType | 'EXEMPT_IMPORT_EXPORT' | 'EXEMPT' | 'OUTSIDE' | 'EXEMPT_REVERSE';

export type SortBy = 'date asc' | 'date desc' | 'createdDate asc' | 'createdDate desc';

// Order line of a purchase or sale (spec: orderLine). Either netPrice or netPriceInCurrency must be provided
export interface OrderLine {
  lineId?: number; // read-only, returned by GET; ignored on create
  description: string; // maxLength: 200
  netPrice?: number; // in cents, NOK
  vat?: number; // in cents, NOK
  account?: string; // expense/income account, e.g. '4000' or '1500:10001'
  vatType: VatType;
  netPriceInCurrency?: number; // in cents, in the purchase/sale currency
  vatInCurrency?: number; // in cents, in the purchase/sale currency
  projectId?: number; // purchases only: project for this line
}

// Payment interface (spec: payment)
export interface Payment {
  paymentId?: number; // read-only
  date: string; // format: yyyy-mm-dd
  account: string; // e.g. '1920:10001'
  amount: number; // in cents, in the payment currency (NOK if currency is omitted)
  amountInNok?: number; // in cents; foreign-currency payments only, the NOK amount that hit the bank account
  currency?: string; // ISO 4217 currency code, only when other than NOK
  fee?: number; // in cents, always NOK
}

// Spec: contact, as Fiken embeds it in results (e.g. a purchase's supplier). Leaves out the spec's writeOnly
// fields (phoneNumber, memberNumber, memberNumberString, currency), which are never returned; the full
// request/result types are in contact.types.ts
export interface Contact {
  contactId?: number;
  createdDate?: string; // format: yyyy-mm-dd
  lastModifiedDate?: string; // format: yyyy-mm-dd
  name: string;
  email?: string;
  organizationNumber?: string;
  customerNumber?: number;
  customerAccountCode?: string; // e.g. '1500:20001'
  supplierNumber?: number;
  supplierAccountCode?: string; // e.g. '2400:20001'
  customer?: boolean;
  supplier?: boolean;
  bankAccountNumber?: string;
  contactPerson?: Array<{
    contactPersonId?: number;
    name: string;
    email: string;
    phoneNumber?: string;
    address?: Address;
  }>;
  notes?: Array<{ author?: string; note?: string }>;
  language?: string | null; // NORWEGIAN or ENGLISH
  inactive?: boolean;
  daysUntilInvoicingDueDate?: number;
  discount?: number; // percent, 0-100
  address?: Address;
  groups?: string[];
  documents?: Attachment[];
}

// Spec: projectResult
export interface ProjectResult {
  projectId?: number;
  number?: string;
  name?: string;
  description?: string;
  startDate?: string; // format: yyyy-mm-dd, inclusive
  endDate?: string; // format: yyyy-mm-dd, inclusive
  contact?: Contact;
  completed?: boolean;
}

export type AttachmentType = 'invoice' | 'reminder' | 'unspecified' | 'ocr' | 'bank_statement';

// Attachment interface (spec: attachment)
export interface Attachment {
  uuid?: string; // the file's UUID; use as attachmentUuid when deleting the attachment
  filename?: string;
  identifier?: string;
  downloadUrl?: string; // for API credentials (bearer token / OAuth 2)
  downloadUrlWithFikenNormalUserCredentials?: string; // requires logging in to Fiken
  comment?: string;
  type?: AttachmentType;
}

// Attachment upload interface. Fiken infers the file type from the filename (.png, .jpeg, .jpg, .gif or .pdf)
export interface AttachmentUpload {
  filename: string;
  // Purchase and sale attachments only (draft uploads take neither); at least one must be true there
  attachToPayment?: boolean;
  attachToSale?: boolean;
  file: Blob | Buffer;
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
  // Fiken answers creates with 201 and an empty body; the new resource's URL is in the Location header
  location?: string;
}

// Counter interface
export interface Counter {
  value?: number;
}

// Spec: address
export interface Address {
  streetAddress?: string;
  streetAddressLine2?: string;
  city?: string;
  postCode?: string;
  country: string;
}
