/**
 * Unit tests for FikenContactService
 */

import { FikenContactService } from '../fiken-contact.service';
import { ContactRequest, ProductRequest } from '../../types/fiken.types';

// Mock fetch globally
global.fetch = jest.fn();

describe('FikenContactService', () => {
  let service: FikenContactService;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  const companySlug = 'test-company';
  const base = `https://api.fiken.no/api/v2/companies/${companySlug}`;

  beforeEach(() => {
    mockFetch = fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockReset();
    service = new FikenContactService({ apiToken: 'test-token', baseUrl: 'https://api.fiken.no/api/v2', enableLogging: false });
  });

  const mockResponse = (data: any, status = 200, extraHeaders: Record<string, string> = {}) => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status,
      json: async () => data,
      text: async () => JSON.stringify(data),
      headers: {
        get: (name: string) => {
          if (name === 'content-type') return 'application/json';
          if (name === 'content-length') return data === undefined ? '0' : '100';
          return extraHeaders[name] ?? null;
        },
      },
    } as unknown as Response);
  };

  const lastCall = () => {
    const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    return { url: String(url), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined };
  };

  describe('contacts', () => {
    it('lists contacts with filters as query params', async () => {
      mockResponse([{ contactId: 1, name: 'Acme AS' }]);

      const result = await service.getContacts(companySlug, { name: 'Acme AS', supplier: true, pageSize: 10 });

      const { url, method } = lastCall();
      expect(method).toBe('GET');
      expect(url).toBe(`${base}/contacts?name=Acme+AS&supplier=true&pageSize=10`);
      expect(result.data).toEqual([{ contactId: 1, name: 'Acme AS' }]);
    });

    it('creates a contact and returns the Location header', async () => {
      const contact: ContactRequest = { name: 'Acme AS', supplier: true };
      mockResponse(undefined, 201, { Location: `${base}/contacts/42` });

      const result = await service.createContact(companySlug, contact);

      expect(lastCall()).toEqual({ url: `${base}/contacts`, method: 'POST', body: contact });
      expect(result.location).toBe(`${base}/contacts/42`);
    });

    it('updates a contact with PUT', async () => {
      mockResponse(undefined, 200);

      await service.updateContact(companySlug, 42, { name: 'Acme AS', inactive: true });

      expect(lastCall()).toMatchObject({ url: `${base}/contacts/42`, method: 'PUT' });
    });

    it('gets contact attachments', async () => {
      mockResponse([]);
      await service.getContactAttachments(companySlug, 42);
      expect(lastCall()).toMatchObject({ url: `${base}/contacts/42/attachments`, method: 'GET' });
    });
  });

  describe('contact persons', () => {
    it('gets, creates and updates contact persons', async () => {
      mockResponse({ contactPersonId: 7, name: 'Kari', email: 'kari@example.no' });
      await service.getContactPerson(companySlug, 42, 7);
      expect(lastCall()).toMatchObject({ url: `${base}/contacts/42/contactPerson/7`, method: 'GET' });

      mockResponse(undefined, 201);
      await service.createContactPerson(companySlug, 42, { name: 'Ola', email: 'ola@example.no' });
      expect(lastCall()).toMatchObject({ url: `${base}/contacts/42/contactPerson`, method: 'POST' });

      mockResponse(undefined, 200);
      await service.updateContactPerson(companySlug, 42, 7, { name: 'Kari', email: 'kari@example.no' });
      expect(lastCall()).toMatchObject({ url: `${base}/contacts/42/contactPerson/7`, method: 'PUT' });
    });
  });

  describe('groups and products', () => {
    it('lists contact groups', async () => {
      mockResponse(['VIP']);
      const result = await service.getContactGroups(companySlug, { page: 1 });
      expect(lastCall()).toMatchObject({ url: `${base}/groups?page=1`, method: 'GET' });
      expect(result.data).toEqual(['VIP']);
    });

    it('creates and updates products', async () => {
      const product: ProductRequest = { name: 'Spade', incomeAccount: '3000', vatType: 'HIGH', active: true, unitPrice: 30000 };

      mockResponse(undefined, 201);
      await service.createProduct(companySlug, product);
      expect(lastCall()).toEqual({ url: `${base}/products`, method: 'POST', body: product });

      mockResponse(undefined, 200);
      await service.updateProduct(companySlug, 5, product);
      expect(lastCall()).toMatchObject({ url: `${base}/products/5`, method: 'PUT' });
    });

    it('posts the product sales report request', async () => {
      mockResponse([{ product: { productId: 5 }, sum: { netAmount: 5000 } }]);
      const result = await service.getProductSalesReport(companySlug, { from: '2024-01-01', to: '2024-12-31' });
      expect(lastCall()).toEqual({
        url: `${base}/products/salesReport`,
        method: 'POST',
        body: { from: '2024-01-01', to: '2024-12-31' },
      });
      expect(result.data).toHaveLength(1);
    });
  });

  describe('validation', () => {
    it.each([0, -1, 1.5, NaN])('rejects contactId %p without calling the API', async id => {
      await expect(service.getContact(companySlug, id)).rejects.toThrow('contactId is required and must be a positive integer');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects an invalid contactPersonId', async () => {
      await expect(service.getContactPerson(companySlug, 1, 0)).rejects.toThrow('contactPersonId');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects an invalid productId', async () => {
      await expect(service.updateProduct(companySlug, -3, {} as ProductRequest)).rejects.toThrow('productId');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it.each(['', '../other', 'a/b'])('rejects company slug %p', async slug => {
      await expect(service.getContacts(slug)).rejects.toThrow(/Company slug/);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
