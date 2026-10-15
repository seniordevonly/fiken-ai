/**
 * Holds the configured Fiken API clients and the default company, shared by every tool.
 */

import { FikenConfig, FikenInvoiceService, FikenPurchaseService, logger } from 'fiken-shared';
import { ConfigSchema, FikenClientConfig, getEnvConfig } from './config.js';
import { CompanySlugSchema } from './schemas.js';

type FikenServiceClass<T> = new (config: FikenConfig) => T;

export class FikenContext {
  private purchaseService: FikenPurchaseService | null = null;
  private invoiceService: FikenInvoiceService | null = null;
  private serviceConfig: FikenConfig | null = null;
  private readonly clients = new Map<FikenServiceClass<unknown>, unknown>();

  constructor(readonly defaultCompanySlug: string | null = null) {}

  /** Build a context from FIKEN_* env vars; stays unconfigured (fiken_configure can fix it) if they're invalid */
  static fromEnvironment(): FikenContext {
    const env = getEnvConfig();
    const context = new FikenContext(env.companySlug || null);

    if (env.apiToken) {
      try {
        context.configure(ConfigSchema.parse({ apiToken: env.apiToken, baseUrl: env.baseUrl, timeout: env.timeout }));
        logger.info('Fiken service auto-configured from environment variables');
      } catch (error) {
        logger.error('Failed to auto-configure from environment:', error);
      }
    }
    return context;
  }

  configure(config: FikenClientConfig): void {
    const serviceConfig = { ...config, enableLogging: true, logLevel: process.env.LOG_LEVEL || 'info' };
    this.serviceConfig = serviceConfig;
    this.clients.clear();
    this.purchaseService = new FikenPurchaseService(serviceConfig);
    this.invoiceService = new FikenInvoiceService(serviceConfig);
  }

  get isConfigured(): boolean {
    return this.purchaseService !== null && this.invoiceService !== null;
  }

  get purchases(): FikenPurchaseService {
    this.ensureConfigured();
    return this.purchaseService!;
  }

  get invoices(): FikenInvoiceService {
    this.ensureConfigured();
    return this.invoiceService!;
  }

  /** A Fiken API client for any resource area, e.g. context.client(FikenContactService); created once per configure */
  client<T>(ServiceClass: FikenServiceClass<T>): T {
    this.ensureConfigured();
    let client = this.clients.get(ServiceClass) as T | undefined;
    if (!client) {
      client = new ServiceClass(this.serviceConfig!);
      this.clients.set(ServiceClass, client);
    }
    return client;
  }

  ensureConfigured(): void {
    if (!this.isConfigured) {
      throw new Error('Fiken service not configured. Please run fiken_configure first.');
    }
  }

  /** The tool's companySlug argument, or the default from FIKEN_COMPANY_SLUG */
  resolveCompanySlug(companySlug: unknown): string {
    const slug = companySlug || this.defaultCompanySlug;
    if (!slug) {
      throw new Error('Company slug is required. Provide it as parameter or set FIKEN_COMPANY_SLUG environment variable.');
    }
    return CompanySlugSchema.parse(slug);
  }
}
