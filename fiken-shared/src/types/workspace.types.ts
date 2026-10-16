/**
 * Fiken User, companies, inbox, EHF, projects and time tracking types
 */

import { Contact } from './shared.types';

// ========== USER & COMPANIES ==========

// Spec: userinfo
export interface UserInfo {
  name?: string;
  email?: string;
}

// Spec: address (the company's postal address)
export interface CompanyAddress {
  streetAddress?: string;
  streetAddressLine2?: string;
  city?: string;
  postCode?: string;
  country: string;
}

export type CompanyVatType = 'no' | 'yearly' | 'monthly' | 'bi-monthly';

// Spec: company
export interface Company {
  name?: string;
  slug?: string; // the companySlug used in every company URL
  organizationNumber?: string;
  vatType?: CompanyVatType;
  address?: CompanyAddress;
  phoneNumber?: string;
  email?: string;
  creationDate?: string; // yyyy-mm-dd
  hasApiAccess?: boolean;
  testCompany?: boolean; // demo company
  accountingStartDate?: string; // yyyy-mm-dd
  vatRegistrationDate?: string; // yyyy-mm-dd
}

export interface CompanyQueryParams {
  page?: number;
  pageSize?: number; // max 100
  sortBy?: 'createdDate asc' | 'createdDate desc' | 'name asc' | 'name desc'
    | 'organizationNumber asc' | 'organizationNumber desc';
}

// ========== INBOX & EHF ==========

// Spec: inboxResult
export interface InboxDocument {
  documentId?: number;
  name?: string;
  description?: string;
  filename?: string;
  status?: boolean; // whether the document has been used as documentation
  createdAt?: string; // date-time
  documentUrl?: string; // for API credentials (bearer token / OAuth 2)
  documentUrlWithFikenNormalUserCredentials?: string;
}

export interface InboxQueryParams {
  page?: number;
  pageSize?: number;
  sortBy?: 'createdDate asc' | 'createdDate desc' | 'name asc' | 'name desc';
  status?: 'all' | 'unused' | 'used';
  name?: string; // case-insensitive substring match
}

export type EhfDocumentStatus = 'unprocessed' | 'used' | 'processed' | 'deleted';

// Spec: ehfDocumentLine
export interface EhfDocumentLine {
  description?: string;
  net?: number; // in cents
  vat?: number; // in cents
  vatType?: string;
}

// Spec: ehfDocumentResult (a received electronic invoice or credit note)
export interface EhfDocument {
  ehfDocumentId?: number;
  status?: EhfDocumentStatus;
  documentType?: 'invoice' | 'creditNote';
  invoiceNumber?: string;
  issueDate?: string; // yyyy-mm-dd
  dueDate?: string; // yyyy-mm-dd
  supplierName?: string;
  supplierOrganizationNumber?: string;
  supplierContactId?: number;
  net?: number; // in cents
  vat?: number; // in cents
  gross?: number; // in cents
  amountDue?: number; // in cents, NOK
  currency?: string;
  kid?: string;
  accountNumber?: string;
  bic?: string;
  iban?: string;
  description?: string;
  purchaseId?: number; // set once booked as a purchase (status processed)
  documentUrl?: string;
  documentUrlWithFikenNormalUserCredentials?: string;
  xmlUrl?: string;
  xmlUrlWithFikenNormalUserCredentials?: string;
  createdAt?: string; // date-time
  lines?: EhfDocumentLine[];
}

export interface EhfQueryParams {
  page?: number;
  pageSize?: number;
  sortBy?: 'createdDate asc' | 'createdDate desc' | 'issueDate asc' | 'issueDate desc';
  status?: EhfDocumentStatus; // all except deleted when omitted
  issueDate?: string;
  issueDateLe?: string;
  issueDateLt?: string;
  issueDateGe?: string;
  issueDateGt?: string;
}

// ========== PROJECTS ==========

// Spec: projectResult (full; shared.types ProjectResult is the simplified form embedded in purchases)
export interface Project {
  projectId?: number;
  number?: string;
  name?: string;
  description?: string;
  startDate?: string; // yyyy-mm-dd, inclusive
  endDate?: string; // yyyy-mm-dd, inclusive
  contact?: Contact;
  completed?: boolean;
}

// Spec: projectRequest
export interface ProjectRequest {
  number: string;
  name: string;
  description?: string;
  startDate: string; // yyyy-mm-dd
  endDate?: string; // yyyy-mm-dd
  contactId?: number;
  completed?: boolean;
}

// Spec: updateProjectRequest (the number can't be changed)
export type UpdateProjectRequest = Partial<Omit<ProjectRequest, 'number'>>;

export interface ProjectQueryParams {
  page?: number;
  pageSize?: number;
  completed?: boolean;
  name?: string;
  number?: string;
}

// ========== TIME TRACKING ==========

// Spec: activityResult
export interface Activity {
  activityId?: number;
  name?: string;
  hourlyRate?: number; // in cents
  product?: { productId?: number; name?: string; [key: string]: unknown };
  billable?: boolean;
  description?: string;
  project?: Project;
  archived?: boolean;
}

// Spec: activityRequest
export interface ActivityRequest {
  name: string; // unique within the company
  hourlyRate?: number; // in cents
  productId?: number;
  billable?: boolean;
  description?: string;
  projectId?: number;
}

// Spec: updateActivityRequest
export type UpdateActivityRequest = Partial<ActivityRequest>;

export interface ActivityQueryParams {
  page?: number;
  pageSize?: number;
  name?: string; // partial match
  archived?: boolean;
}

// Spec: timeUserResult (a person who can register time)
export interface TimeUser {
  timeUserId?: number;
  name?: string;
  email?: string;
  createdDate?: string; // date-time
  lastModifiedDate?: string; // date-time
}

export interface TimeUserQueryParams {
  page?: number;
  pageSize?: number;
  name?: string; // partial match
  email?: string;
}

// Spec: timeEntryResult
export interface TimeEntry {
  timeEntryId?: number;
  date?: string; // yyyy-mm-dd
  hours?: number;
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm, calculated
  description?: string; // visible on invoices
  internalNote?: string;
  activity?: Activity;
  project?: Project;
  timeUser?: TimeUser;
  invoiced?: boolean;
  invoiceId?: number;
  locked?: boolean;
  createdDate?: string; // date-time
  lastModifiedDate?: string; // date-time
}

// Spec: timeEntryRequest
export interface TimeEntryRequest {
  date: string; // yyyy-mm-dd
  hours: number;
  startTime?: string; // HH:mm
  description?: string;
  internalNote?: string;
  activityId: number;
  projectId?: number;
  timeUserId: number;
}

// Spec: updateTimeEntryRequest (the time user can't be changed)
export type UpdateTimeEntryRequest = Partial<Omit<TimeEntryRequest, 'timeUserId'>>;

export interface TimeEntryQueryParams {
  page?: number;
  pageSize?: number;
  date?: string;
  dateGe?: string;
  dateLe?: string;
  projectId?: number;
  activityId?: number;
  timeUserId?: number;
  invoiced?: boolean;
  lastModifiedGe?: string; // date-time
  lastModifiedLe?: string; // date-time
}

// Spec: timeEntryInvoiceDraftRequest
export interface TimeEntryInvoiceDraftRequest {
  timeEntryIds: number[];
  customerId: number; // a contact with customer=true
  daysUntilDueDate: number;
  groupBy?: 'activity' | 'activityAndPerson' | 'none';
  includeTimeEntryDescriptions?: boolean;
  issueDate?: string; // yyyy-mm-dd, defaults to today
  projectId?: number;
  invoiceText?: string;
  yourReference?: string;
  ourReference?: string;
  orderReference?: string;
  currency?: string; // ISO 4217, defaults to NOK
  bankAccountNumber?: string;
}
