import { describe, expect, it, vi } from 'vitest';
import type { FikenContext } from '../context.js';
import { contactToolArgs, contactTools } from './contacts.js';

const headers = {
  'Fiken-Api-Page': 0,
  'Fiken-Api-Page-Size': 25,
  'Fiken-Api-Page-Count': 1,
  'Fiken-Api-Result-Count': 1,
};

const contact = {
  contactId: 42,
  name: 'Acme AS',
  organizationNumber: '913312465',
  email: 'post@acme.no',
  supplierNumber: 20001,
  supplierAccountCode: '2400:20001',
  supplier: true,
  customer: false,
  inactive: false,
  address: { country: 'Norway', city: 'Oslo' },
  contactPerson: [{ contactPersonId: 7, name: 'Kari', email: 'kari@acme.no' }],
};

const product = { productId: 5, name: 'Spade', productNumber: '125-1', unitPrice: 30000, vatType: 'HIGH', incomeAccount: '3000', active: true, stock: 3 };

const setup = () => {
  const service = {
    getContacts: vi.fn().mockResolvedValue({ data: [contact], headers }),
    getContact: vi.fn().mockResolvedValue({ data: contact }),
    createContact: vi.fn().mockResolvedValue({ data: undefined, location: 'https://api.fiken.no/api/v2/companies/co/contacts/43' }),
    updateContact: vi.fn().mockResolvedValue({ data: undefined, location: 'https://api.fiken.no/api/v2/companies/co/contacts/42' }),
    getContactPersons: vi.fn().mockResolvedValue({ data: contact.contactPerson }),
    createContactPerson: vi.fn().mockResolvedValue({ data: undefined, location: 'https://api.fiken.no/api/v2/companies/co/contacts/42/contactPerson/8' }),
    getContactGroups: vi.fn().mockResolvedValue({ data: ['VIP'], headers }),
    getProducts: vi.fn().mockResolvedValue({ data: [product], headers }),
    getProductSalesReport: vi.fn().mockResolvedValue({
      data: [{ product, sold: { count: 2, netAmount: 60000 }, credited: { count: 0 }, sum: { count: 2, netAmount: 60000 } }],
    }),
  };
  const context = { resolveCompanySlug: (s?: string) => s ?? 'co', client: () => service } as unknown as FikenContext;
  const call = (name: string, args: Record<string, any> = {}) => {
    const tool = contactTools.find(t => t.name === name);
    if (!tool) throw new Error(`no tool ${name}`);
    return tool.handler(args, context);
  };
  const json = async (name: string, args?: Record<string, any>) => JSON.parse((await call(name, args)).content[0].text);
  return { service, call, json };
};

describe('contactTools', () => {
  it('has unique fiken_ names and no delete/send tools', () => {
    const names = contactTools.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^fiken_[a-z_]+$/);
      expect(name).not.toMatch(/delete|send/);
    }
  });

  it('advertises exactly the top-level fields its zod schema accepts', () => {
    expect(Object.keys(contactToolArgs).sort()).toEqual(contactTools.map(t => t.name).sort());
    for (const tool of contactTools) {
      const shape = contactToolArgs[tool.name as keyof typeof contactToolArgs].shape;
      expect(Object.keys(tool.inputSchema.properties ?? {}).sort(), tool.name).toEqual(Object.keys(shape).sort());
      for (const field of (tool.inputSchema.required as string[] | undefined) ?? []) {
        expect(shape[field as keyof typeof shape].isOptional(), `${tool.name}.${field}`).toBe(false);
      }
    }
  });

  it('advertises the same params filters as the zod schema', () => {
    for (const name of ['fiken_get_contacts', 'fiken_get_products', 'fiken_get_contact_groups'] as const) {
      const tool = contactTools.find(t => t.name === name)!;
      const advertised = Object.keys((tool.inputSchema.properties as any).params.properties).sort();
      const zodParams = (contactToolArgs[name].shape.params as any).unwrap().shape;
      expect(advertised, name).toEqual(Object.keys(zodParams).sort());
    }
  });

  describe('fiken_get_contacts', () => {
    it('returns pagination and compact summaries', async () => {
      const { json } = setup();
      expect(await json('fiken_get_contacts')).toEqual({
        pagination: { page: 0, pageSize: 25, pageCount: 1, resultCount: 1 },
        contacts: [{
          contactId: 42,
          name: 'Acme AS',
          organizationNumber: '913312465',
          email: 'post@acme.no',
          supplierNumber: 20001,
          inactive: false,
        }],
      });
    });

    it('passes filters through and returns full records on request', async () => {
      const { service, json } = setup();
      const params = { organizationNumber: '913312465', supplier: true, pageSize: 100 };
      const result = await json('fiken_get_contacts', { companySlug: 'other', detail: 'full', params });
      expect(service.getContacts).toHaveBeenCalledWith('other', params);
      expect(result.contacts).toEqual([contact]);
    });

    it('names the invalid field', async () => {
      const { call } = setup();
      await expect(call('fiken_get_contacts', { params: { pageSize: 500 } })).rejects.toMatchObject({
        issues: [expect.objectContaining({ path: ['params', 'pageSize'] })],
      });
      await expect(call('fiken_get_contacts', { params: { createdDateGe: '15.01.2024' } })).rejects.toMatchObject({
        issues: [expect.objectContaining({ path: ['params', 'createdDateGe'] })],
      });
    });
  });

  it('fiken_get_contact returns the contact', async () => {
    const { service, json } = setup();
    expect(await json('fiken_get_contact', { contactId: 42 })).toEqual(contact);
    expect(service.getContact).toHaveBeenCalledWith('co', 42);
  });

  it('fiken_create_contact returns the new id', async () => {
    const { service, json } = setup();
    const input = { name: 'New AS', supplier: true, address: { country: 'Norway' } };
    expect(await json('fiken_create_contact', { contact: input })).toEqual({
      message: 'Contact created',
      id: 43,
      location: 'https://api.fiken.no/api/v2/companies/co/contacts/43',
    });
    expect(service.createContact).toHaveBeenCalledWith('co', input);
  });

  it('fiken_create_contact rejects bad input by field', async () => {
    const { call, service } = setup();
    await expect(call('fiken_create_contact', { contact: { supplier: true } })).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ['contact', 'name'] })],
    });
    await expect(call('fiken_create_contact', { contact: { name: 'X', address: {} } })).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ['contact', 'address', 'country'] })],
    });
    expect(service.createContact).not.toHaveBeenCalled();
  });

  it('fiken_update_contact validates the id and returns it', async () => {
    const { call, json, service } = setup();
    await expect(call('fiken_update_contact', { contactId: -1, contact: { name: 'X' } })).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ['contactId'] })],
    });
    expect(await json('fiken_update_contact', { contactId: 42, contact: { name: 'Acme AS', inactive: true } }))
      .toMatchObject({ message: 'Contact updated', id: 42 });
    expect(service.updateContact).toHaveBeenCalledWith('co', 42, { name: 'Acme AS', inactive: true });
  });

  it('fiken_create_contact_person requires name and email', async () => {
    const { call, json } = setup();
    await expect(call('fiken_create_contact_person', { contactId: 42, contactPerson: { name: 'Ola' } })).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ['contactPerson', 'email'] })],
    });
    expect(await json('fiken_create_contact_person', { contactId: 42, contactPerson: { name: 'Ola', email: 'ola@acme.no' } }))
      .toMatchObject({ id: 8 });
  });

  it('fiken_get_contact_groups lists group names', async () => {
    const { json } = setup();
    expect(await json('fiken_get_contact_groups')).toEqual({
      pagination: { page: 0, pageSize: 25, pageCount: 1, resultCount: 1 },
      groups: ['VIP'],
    });
  });

  it('fiken_get_products returns compact summaries', async () => {
    const { json } = setup();
    const { products } = await json('fiken_get_products', { params: { active: true } });
    expect(products).toEqual([{
      productId: 5, name: 'Spade', productNumber: '125-1', unitPrice: 30000, vatType: 'HIGH', incomeAccount: '3000', active: true,
    }]);
  });

  it('fiken_create_product rejects an unknown vatType', async () => {
    const { call } = setup();
    const product = { name: 'Spade', incomeAccount: '3000', vatType: 'RAW_FISH', active: true };
    await expect(call('fiken_create_product', { product })).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ['product', 'vatType'] })],
    });
  });

  it('fiken_get_product_sales_report trims the product record', async () => {
    const { json, service } = setup();
    const rows = await json('fiken_get_product_sales_report', { from: '2024-01-01', to: '2024-12-31' });
    expect(service.getProductSalesReport).toHaveBeenCalledWith('co', { from: '2024-01-01', to: '2024-12-31' });
    expect(rows).toEqual([{
      product: { productId: 5, name: 'Spade', productNumber: '125-1' },
      sold: { count: 2, netAmount: 60000 },
      credited: { count: 0 },
      sum: { count: 2, netAmount: 60000 },
    }]);
  });
});
