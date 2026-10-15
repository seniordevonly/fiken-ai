/**
 * Fiken Contacts, contact persons, contact groups and products
 */

import { FikenBaseService, FikenConfig } from './fiken-base.service';
import {
  Attachment,
  ContactGroupQueryParams,
  ContactPerson,
  ContactPersonRequest,
  ContactQueryParams,
  ContactRequest,
  ContactResult,
  FikenApiResponse,
  ProductQueryParams,
  ProductRequest,
  ProductResult,
  ProductSalesReportRequest,
  ProductSalesReportResult,
} from '../types/fiken.types';

export class FikenContactService extends FikenBaseService {
  constructor(config: FikenConfig) {
    super(config);
  }

  // ========== CONTACTS ==========

  /**
   * GET /companies/{companySlug}/contacts
   */
  async getContacts(
    companySlug: string,
    params?: ContactQueryParams
  ): Promise<FikenApiResponse<ContactResult[]>> {
    this.validateCompanySlug(companySlug);
    return this.get<ContactResult[]>(`/companies/${companySlug}/contacts`, params);
  }

  /**
   * POST /companies/{companySlug}/contacts; the new contact's URL is in `location`
   */
  async createContact(companySlug: string, contact: ContactRequest): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    return this.post<void>(`/companies/${companySlug}/contacts`, contact);
  }

  /**
   * GET /companies/{companySlug}/contacts/{contactId}
   */
  async getContact(companySlug: string, contactId: number): Promise<FikenApiResponse<ContactResult>> {
    this.validateCompanySlug(companySlug);
    this.validateId(contactId, 'contactId');
    return this.get<ContactResult>(`/companies/${companySlug}/contacts/${contactId}`);
  }

  /**
   * PUT /companies/{companySlug}/contacts/{contactId}; replaces the contact's writable fields
   */
  async updateContact(
    companySlug: string,
    contactId: number,
    contact: ContactRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(contactId, 'contactId');
    return this.put<void>(`/companies/${companySlug}/contacts/${contactId}`, contact);
  }

  /**
   * GET /companies/{companySlug}/contacts/{contactId}/attachments
   */
  async getContactAttachments(companySlug: string, contactId: number): Promise<FikenApiResponse<Attachment[]>> {
    this.validateCompanySlug(companySlug);
    this.validateId(contactId, 'contactId');
    return this.get<Attachment[]>(`/companies/${companySlug}/contacts/${contactId}/attachments`);
  }

  // ========== CONTACT PERSONS ==========

  /**
   * GET /companies/{companySlug}/contacts/{contactId}/contactPerson
   */
  async getContactPersons(companySlug: string, contactId: number): Promise<FikenApiResponse<ContactPerson[]>> {
    this.validateCompanySlug(companySlug);
    this.validateId(contactId, 'contactId');
    return this.get<ContactPerson[]>(`/companies/${companySlug}/contacts/${contactId}/contactPerson`);
  }

  /**
   * POST /companies/{companySlug}/contacts/{contactId}/contactPerson
   */
  async createContactPerson(
    companySlug: string,
    contactId: number,
    contactPerson: ContactPersonRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(contactId, 'contactId');
    return this.post<void>(`/companies/${companySlug}/contacts/${contactId}/contactPerson`, contactPerson);
  }

  /**
   * GET /companies/{companySlug}/contacts/{contactId}/contactPerson/{contactPersonId}
   */
  async getContactPerson(
    companySlug: string,
    contactId: number,
    contactPersonId: number
  ): Promise<FikenApiResponse<ContactPerson>> {
    this.validateCompanySlug(companySlug);
    this.validateId(contactId, 'contactId');
    this.validateId(contactPersonId, 'contactPersonId');
    return this.get<ContactPerson>(
      `/companies/${companySlug}/contacts/${contactId}/contactPerson/${contactPersonId}`
    );
  }

  /**
   * PUT /companies/{companySlug}/contacts/{contactId}/contactPerson/{contactPersonId}
   */
  async updateContactPerson(
    companySlug: string,
    contactId: number,
    contactPersonId: number,
    contactPerson: ContactPersonRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(contactId, 'contactId');
    this.validateId(contactPersonId, 'contactPersonId');
    return this.put<void>(
      `/companies/${companySlug}/contacts/${contactId}/contactPerson/${contactPersonId}`,
      contactPerson
    );
  }

  // ========== CONTACT GROUPS ==========

  /**
   * GET /companies/{companySlug}/groups; returns the customer group names
   */
  async getContactGroups(
    companySlug: string,
    params?: ContactGroupQueryParams
  ): Promise<FikenApiResponse<string[]>> {
    this.validateCompanySlug(companySlug);
    return this.get<string[]>(`/companies/${companySlug}/groups`, params);
  }

  // ========== PRODUCTS ==========

  /**
   * GET /companies/{companySlug}/products
   */
  async getProducts(
    companySlug: string,
    params?: ProductQueryParams
  ): Promise<FikenApiResponse<ProductResult[]>> {
    this.validateCompanySlug(companySlug);
    return this.get<ProductResult[]>(`/companies/${companySlug}/products`, params);
  }

  /**
   * POST /companies/{companySlug}/products; the new product's URL is in `location`
   */
  async createProduct(companySlug: string, product: ProductRequest): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    return this.post<void>(`/companies/${companySlug}/products`, product);
  }

  /**
   * GET /companies/{companySlug}/products/{productId}
   */
  async getProduct(companySlug: string, productId: number): Promise<FikenApiResponse<ProductResult>> {
    this.validateCompanySlug(companySlug);
    this.validateId(productId, 'productId');
    return this.get<ProductResult>(`/companies/${companySlug}/products/${productId}`);
  }

  /**
   * PUT /companies/{companySlug}/products/{productId}; replaces the product's writable fields
   */
  async updateProduct(
    companySlug: string,
    productId: number,
    product: ProductRequest
  ): Promise<FikenApiResponse<void>> {
    this.validateCompanySlug(companySlug);
    this.validateId(productId, 'productId');
    return this.put<void>(`/companies/${companySlug}/products/${productId}`, product);
  }

  /**
   * POST /companies/{companySlug}/products/salesReport; a read despite the POST
   */
  async getProductSalesReport(
    companySlug: string,
    request: ProductSalesReportRequest
  ): Promise<FikenApiResponse<ProductSalesReportResult[]>> {
    this.validateCompanySlug(companySlug);
    return this.post<ProductSalesReportResult[]>(`/companies/${companySlug}/products/salesReport`, request);
  }
}
