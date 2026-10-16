import { FikenInvoiceService, FikenPurchaseService } from 'fiken-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { FikenContext } from './context.js';

const NOT_CONFIGURED = 'Fiken service not configured. Please run fiken_configure first.';

describe('FikenContext', () => {
  describe('resolveCompanySlug', () => {
    it('prefers the explicit slug', () => {
      expect(new FikenContext('default-co').resolveCompanySlug('explicit-co')).toBe('explicit-co');
    });

    it('falls back to the default slug', () => {
      expect(new FikenContext('default-co').resolveCompanySlug(undefined)).toBe('default-co');
    });

    it('falls back to the default slug when given an empty string', () => {
      expect(new FikenContext('default-co').resolveCompanySlug('')).toBe('default-co');
    });

    it('throws when there is neither an explicit nor a default slug', () => {
      expect(() => new FikenContext().resolveCompanySlug(undefined)).toThrow(
        'Company slug is required. Provide it as parameter or set FIKEN_COMPANY_SLUG environment variable.',
      );
    });

    it('treats an empty slug with no default as missing', () => {
      expect(() => new FikenContext('').resolveCompanySlug('')).toThrow('Company slug is required');
    });

    it('rejects a slug that is not a string', () => {
      expect(() => new FikenContext().resolveCompanySlug(123)).toThrow(ZodError);
    });
  });

  describe('before configure()', () => {
    const context = new FikenContext('co');

    it('is not configured', () => {
      expect(context.isConfigured).toBe(false);
    });

    it('throws from the purchases getter', () => {
      expect(() => context.purchases).toThrow(NOT_CONFIGURED);
    });

    it('throws from the invoices getter', () => {
      expect(() => context.invoices).toThrow(NOT_CONFIGURED);
    });
  });

  describe('configure()', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('creates the services and marks the context configured', () => {
      // The services log their own initialisation; keep test output quiet
      vi.stubEnv('LOG_LEVEL', 'error');
      const context = new FikenContext();

      context.configure({ apiToken: 'test-token' });

      expect(context.isConfigured).toBe(true);
      expect(context.purchases).toBeInstanceOf(FikenPurchaseService);
      expect(context.invoices).toBeInstanceOf(FikenInvoiceService);
    });
  });
});
