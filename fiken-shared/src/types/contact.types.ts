/**
 * Fiken contact, contact person, contact group and product types, following the v2 OpenAPI spec
 * (swagger/swagger.yaml). All amounts are integer cents (øre) unless noted otherwise.
 */

import { Attachment } from './shared.types';

// Postal address of a contact or contact person (spec: address)
export interface ContactAddress {
  streetAddress?: string;
  streetAddressLine2?: string;
  city?: string;
  postCode?: string;
  country: string;
}

// Contact person (spec: contactPerson)
export interface ContactPerson {
  contactPersonId?: number; // read-only
  name: string;
  email: string;
  phoneNumber?: string;
  address?: ContactAddress;
}

export type ContactPersonRequest = Omit<ContactPerson, 'contactPersonId'>;

// Note on a contact (spec: contactNote)
export interface ContactNote {
  author?: string;
  note?: string;
}

// Writable contact fields (spec: contact, without its readOnly fields)
export interface ContactRequest {
  name: string; // 1-200 chars
  email?: string; // maxLength: 200
  organizationNumber?: string; // Brreg organization number
  phoneNumber?: string; // maxLength: 20
  memberNumber?: number; // deprecated, use memberNumberString
  memberNumberString?: string; // id that connects the contact to your own data
  customer?: boolean; // a contact can be both customer and supplier
  supplier?: boolean;
  bankAccountNumber?: string; // maxLength: 11
  contactPerson?: ContactPersonRequest[];
  currency?: string; // ISO 4217; default currency for invoices to this contact
  language?: string | null; // NORWEGIAN or ENGLISH, defaults to NORWEGIAN
  inactive?: boolean;
  daysUntilInvoicingDueDate?: number;
  discount?: number; // percent, 0-100, decimals allowed
  address?: ContactAddress;
  groups?: string[]; // customer groups
}

// Contact as returned by GET (spec: contact; its writeOnly fields are never returned)
export interface ContactResult {
  contactId: number;
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
  contactPerson?: ContactPerson[];
  notes?: ContactNote[];
  language?: string | null;
  inactive?: boolean;
  daysUntilInvoicingDueDate?: number;
  discount?: number;
  address?: ContactAddress;
  groups?: string[];
  documents?: Attachment[];
}

export type ContactSortBy = 'lastModified asc' | 'lastModified desc' | 'createdDate asc' | 'createdDate desc';

// Query parameters for GET /contacts
export interface ContactQueryParams {
  page?: number;
  pageSize?: number; // 1-100
  lastModified?: string; // format: yyyy-mm-dd
  lastModifiedLe?: string;
  lastModifiedLt?: string;
  lastModifiedGe?: string;
  lastModifiedGt?: string;
  createdDate?: string; // format: yyyy-mm-dd
  createdDateLe?: string;
  createdDateLt?: string;
  createdDateGe?: string;
  createdDateGt?: string;
  supplierNumber?: number;
  customerNumber?: number;
  memberNumber?: number; // deprecated, use memberNumberString
  memberNumberString?: string;
  name?: string; // exact match
  organizationNumber?: string;
  email?: string;
  customer?: boolean;
  supplier?: boolean; // with customer=true too, only contacts that are both
  inactive?: boolean;
  group?: string; // exact match
  sortBy?: ContactSortBy;
  phoneNumber?: string;
}

// Query parameters for GET /groups
export interface ContactGroupQueryParams {
  page?: number;
  pageSize?: number; // 1-100
}

// VAT types the spec allows on a product
export type ProductVatType =
  | 'HIGH' | 'MEDIUM' | 'LOW' | 'EXEMPT' | 'EXEMPT_IMPORT_EXPORT' | 'EXEMPT_REVERSE' | 'OUTSIDE' | 'NONE';

// Writable product fields (spec: product, without its readOnly fields)
export interface ProductRequest {
  name: string;
  unitPrice?: number; // net unit price in cents
  incomeAccount: string; // e.g. '3000'
  vatType: ProductVatType;
  active: boolean;
  productNumber?: string;
  stock?: number; // decimals allowed
  note?: string; // maxLength: 200
}

// Product as returned by GET (spec: product)
export interface ProductResult extends Partial<ProductRequest> {
  productId: number;
  createdDate?: string; // format: yyyy-mm-dd
  lastModifiedDate?: string; // format: yyyy-mm-dd
}

// Query parameters for GET /products
export interface ProductQueryParams {
  page?: number;
  pageSize?: number; // 1-100
  createdDate?: string; // format: yyyy-mm-dd
  createdDateLe?: string;
  createdDateLt?: string;
  createdDateGe?: string;
  createdDateGt?: string;
  lastModified?: string; // format: yyyy-mm-dd
  lastModifiedLe?: string;
  lastModifiedLt?: string;
  lastModifiedGe?: string;
  lastModifiedGt?: string;
  name?: string; // exact match
  productNumber?: string;
  active?: boolean;
}

// Spec: productSalesReportRequest; both dates inclusive
export interface ProductSalesReportRequest {
  from: string; // format: yyyy-mm-dd
  to: string; // format: yyyy-mm-dd
}

// Spec: productSalesLineInfo
export interface ProductSalesLineInfo {
  count?: number;
  sales?: number;
  netAmount?: number; // in cents, excluding VAT
  vatAmount?: number; // in cents
  grossAmount?: number; // in cents, net + VAT
}

// Spec: productSalesReportResult
export interface ProductSalesReportResult {
  product?: ProductResult;
  sold?: ProductSalesLineInfo;
  credited?: ProductSalesLineInfo;
  sum?: ProductSalesLineInfo;
}
