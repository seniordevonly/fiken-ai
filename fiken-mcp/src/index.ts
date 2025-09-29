#!/usr/bin/env node

/**
 * Fiken MCP Server
 * 
 * A Model Context Protocol server that provides tools for interacting with
 * the Fiken Purchase Service API.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { FikenPurchaseService, VatType, logger } from 'fiken-shared';
import { z } from 'zod';

// VAT Type enum for validation
const VatTypeEnum = z.enum([
  'NONE', 'HIGH', 'MEDIUM', 'RAW_FISH', 'LOW',
  'EXEMPT_IMPORT_EXPORT', 'EXEMPT', 'OUTSIDE', 'EXEMPT_REVERSE',
  'HIGH_DIRECT', 'HIGH_BASIS', 'MEDIUM_DIRECT', 'MEDIUM_BASIS', 'NONE_IMPORT_BASIS',
  'HIGH_FOREIGN_SERVICE_DEDUCTIBLE', 'HIGH_FOREIGN_SERVICE_NONDEDUCTIBLE',
  'LOW_FOREIGN_SERVICE_DEDUCTIBLE', 'LOW_FOREIGN_SERVICE_NONDEDUCTIBLE',
  'HIGH_PURCHASE_OF_EMISSIONSTRADING_OR_GOLD_DEDUCTIBLE', 
  'HIGH_PURCHASE_OF_EMISSIONSTRADING_OR_GOLD_NONDEDUCTIBLE'
]);

// Environment variable configuration
const getEnvConfig = () => ({
  apiToken: process.env.FIKEN_API_TOKEN,
  companySlug: process.env.FIKEN_COMPANY_SLUG,
  baseUrl: process.env.FIKEN_BASE_URL,
  timeout: process.env.FIKEN_TIMEOUT ? parseInt(process.env.FIKEN_TIMEOUT, 10) : undefined,
});

// Validation schemas
const ConfigSchema = z.object({
  apiToken: z.string().min(1, 'API token is required'),
  baseUrl: z.string().url().optional(),
  timeout: z.number().positive().optional(),
});

const CompanySlugSchema = z.string().min(1, 'Company slug is required');

const PurchaseQueryParamsSchema = z.object({
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateLe: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateLt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateGe: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateGt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sortBy: z.enum(['date asc', 'date desc', 'createdDate asc', 'createdDate desc']).optional(),
  paid: z.boolean().default(false),
});

const PurchaseRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  kind: z.enum(['cash_purchase', 'supplier']),
  currency: z.string().length(3, 'Currency must be a 3-letter ISO code'),
  identifier: z.string().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  supplierId: z.number().int().positive().optional(),
  paymentAccount: z.string().optional(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  kid: z.string().optional(),
  projectId: z.number().int().positive().optional(),
  paid: z.boolean().default(false),
  lines: z.array(z.object({
    description: z.string().min(1, 'Line description is required').max(200, 'Description must be 200 characters or less'),
    netPrice: z.number().int().optional(),
    vat: z.number().int().optional(),
    account: z.string().optional(),
    vatType: VatTypeEnum,
    netPriceInCurrency: z.number().int().optional(),
    vatInCurrency: z.number().int().optional(),
    projectId: z.number().int().positive().optional(),
  })).min(1, 'At least one line is required'),
});

const DraftRequestSchema = z.object({
  cash: z.boolean(),
  currency: z.string().length(3).optional(),
  invoiceIssueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  invoiceNumber: z.string().optional(),
  contactId: z.number().int().positive().optional(),
  projectId: z.number().int().positive().optional(),
  kid: z.string().optional(),
  paid: z.boolean().default(false),
  lines: z.array(z.object({
    text: z.string().min(1, 'Line text is required').max(200, 'Text must be 200 characters or less'),
    vatType: VatTypeEnum,
    incomeAccount: z.string().min(1, 'Income account is required'),
    net: z.number().int().min(0, 'Net amount must be non-negative'),
    gross: z.number().int().min(0, 'Gross amount must be non-negative'),
    projectId: z.number().int().positive().optional(),
  })).min(1, 'At least one line is required'),
});

const PaymentSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  account: z.string().min(1, 'Account is required'),
  amount: z.number().int().positive('Amount must be positive'),
  amountInNok: z.number().int().positive().optional(),
  currency: z.string().length(3).optional(),
  fee: z.number().int().optional(),
});

class FikenMCPServer {
  private server: Server;
  private purchaseService: FikenPurchaseService | null = null;
  private defaultCompanySlug: string | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'fiken-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize with environment variables if available
    this.initializeFromEnvironment();
    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'fiken_status',
            description: 'Check the current configuration status of the Fiken MCP server',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'fiken_configure',
            description: 'Configure the Fiken API connection with authentication token',
            inputSchema: {
              type: 'object',
              properties: {
                apiToken: {
                  type: 'string',
                  description: 'Fiken API authentication token',
                },
                baseUrl: {
                  type: 'string',
                  description: 'Base URL for Fiken API (optional, defaults to https://api.fiken.no/api/v2)',
                },
                timeout: {
                  type: 'number',
                  description: 'Request timeout in milliseconds (optional, defaults to 30000)',
                },
              },
              required: ['apiToken'],
            },
          },
          {
            name: 'fiken_get_purchases',
            description: 'Get all purchases for a company with optional filtering and pagination',
            inputSchema: {
              type: 'object',
              properties: {
                companySlug: {
                  type: 'string',
                  description: 'Company identifier slug (optional if FIKEN_COMPANY_SLUG env var is set)',
                },
                params: {
                  type: 'object',
                  properties: {
                    page: { type: 'number', description: 'Page number (0-based)' },
                    pageSize: { type: 'number', description: 'Number of items per page (1-100)' },
                    date: { type: 'string', description: 'Filter by exact date (YYYY-MM-DD)' },
                    dateLe: { type: 'string', description: 'Filter by date less than or equal (YYYY-MM-DD)' },
                    dateLt: { type: 'string', description: 'Filter by date less than (YYYY-MM-DD)' },
                    dateGe: { type: 'string', description: 'Filter by date greater than or equal (YYYY-MM-DD)' },
                    dateGt: { type: 'string', description: 'Filter by date greater than (YYYY-MM-DD)' },
                    sortBy: { type: 'string', enum: ['date asc', 'date desc', 'createdDate asc', 'createdDate desc'] },
                    paid: { type: 'boolean', description: 'Filter by payment status' },
                  },
                },
              },
              required: [],
            },
          },
          {
            name: 'fiken_create_purchase',
            description: 'Create a new purchase in Fiken',
            inputSchema: {
              type: 'object',
              properties: {
                companySlug: {
                  type: 'string',
                  description: 'Company identifier slug (optional if FIKEN_COMPANY_SLUG env var is set)',
                },
                purchase: {
                  type: 'object',
                  properties: {
                    date: { type: 'string', description: 'Purchase date (YYYY-MM-DD)' },
                    kind: { type: 'string', enum: ['cash_purchase', 'supplier'] },
                    currency: { type: 'string', description: '3-letter ISO currency code' },
                    identifier: { type: 'string', description: 'Invoice/sale number or similar' },
                    dueDate: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
                    supplierId: { type: 'number', description: 'Supplier contact ID' },
                    lines: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          description: { type: 'string', description: 'Line item description' },
                          netPrice: { type: 'number', description: 'Net price in cents' },
                          vat: { type: 'number', description: 'VAT amount in cents' },
                          account: { type: 'string', description: 'Account code' },
                          vatType: { type: 'string', description: 'VAT type (e.g., HIGH, MEDIUM, LOW)' },
                        },
                        required: ['description', 'vatType'],
                      },
                    },
                  },
                  required: ['date', 'kind', 'currency', 'lines'],
                },
              },
              required: ['purchase'],
            },
          },
          {
            name: 'fiken_get_purchase',
            description: 'Get a specific purchase by ID',
            inputSchema: {
              type: 'object',
              properties: {
                companySlug: {
                  type: 'string',
                  description: 'Company identifier slug (optional if FIKEN_COMPANY_SLUG env var is set)',
                },
                purchaseId: {
                  type: 'number',
                  description: 'Purchase ID',
                },
              },
              required: ['purchaseId'],
            },
          },
          {
            name: 'fiken_delete_purchase',
            description: 'Delete a purchase (creates reverse transaction)',
            inputSchema: {
              type: 'object',
              properties: {
                companySlug: {
                  type: 'string',
                  description: 'Company identifier slug (optional if FIKEN_COMPANY_SLUG env var is set)',
                },
                purchaseId: {
                  type: 'number',
                  description: 'Purchase ID to delete',
                },
                description: {
                  type: 'string',
                  description: 'Required description for the deletion',
                },
              },
              required: ['purchaseId', 'description'],
            },
          },
          {
            name: 'fiken_create_purchase_draft',
            description: 'Create a new purchase draft',
            inputSchema: {
              type: 'object',
              properties: {
                companySlug: {
                  type: 'string',
                  description: 'Company identifier slug (optional if FIKEN_COMPANY_SLUG env var is set)',
                },
                draft: {
                  type: 'object',
                  properties: {
                    cash: { type: 'boolean', description: 'Whether this is a cash purchase' },
                    currency: { type: 'string', description: '3-letter ISO currency code' },
                    contactId: { type: 'number', description: 'Contact ID' },
                    lines: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          description: { type: 'string', description: 'Line item description' },
                          netPrice: { type: 'number', description: 'Net price in cents' },
                          vatType: { type: 'string', description: 'VAT type' },
                        },
                        required: ['description', 'vatType'],
                      },
                    },
                  },
                  required: ['cash', 'lines'],
                },
              },
              required: ['draft'],
            },          },
          {
            name: 'fiken_get_purchase_draft',
            description: 'Get a specific purchase draft by ID',
            inputSchema: {
              type: 'object',
              properties: {
                companySlug: {
                  type: 'string',
                  description: 'Company identifier slug (optional if FIKEN_COMPANY_SLUG env var is set)',
                },
                draftId: {
                  type: 'number',
                  description: 'Purchase draft ID',
                },
              },
              required: ['draftId'],
            },
          },
          {
            name: 'fiken_create_purchase_payment',
            description: 'Create a payment for a purchase',
            inputSchema: {
              type: 'object',
              properties: {
                companySlug: {
                  type: 'string',
                  description: 'Company identifier slug (optional if FIKEN_COMPANY_SLUG env var is set)',
                },
                purchaseId: {
                  type: 'number',
                  description: 'Purchase ID',
                },
                payment: {
                  type: 'object',
                  properties: {
                    date: { type: 'string', description: 'Payment date (YYYY-MM-DD)' },
                    account: { type: 'string', description: 'Payment account' },
                    amount: { type: 'number', description: 'Payment amount in cents' },
                    currency: { type: 'string', description: '3-letter ISO currency code' },
                  },
                  required: ['date', 'account', 'amount'],
                },
              },
              required: ['purchaseId', 'payment'],
            },
          },
        ] as Tool[],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'fiken_status':
            return await this.handleStatus(args);
          case 'fiken_configure':
            return await this.handleConfigure(args);
          case 'fiken_get_purchases':
            return await this.handleGetPurchases(args);
          case 'fiken_create_purchase':
            return await this.handleCreatePurchase(args);
          case 'fiken_get_purchase':
            return await this.handleGetPurchase(args);
          case 'fiken_delete_purchase':
            return await this.handleDeletePurchase(args);
          case 'fiken_create_purchase_draft':
            return await this.handleCreatePurchaseDraft(args);
          case 'fiken_get_purchase_draft':
            return await this.handleGetPurchaseDraft(args);
          case 'fiken_create_purchase_payment':
            return await this.handleCreatePurchasePayment(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private initializeFromEnvironment(): void {
    const envConfig = getEnvConfig();
    
    // Set default company slug from environment
    if (envConfig.companySlug) {
      this.defaultCompanySlug = envConfig.companySlug;
    }
    
    // Auto-configure service if API token is available
    if (envConfig.apiToken) {
      try {
        const config = ConfigSchema.parse({
          apiToken: envConfig.apiToken,
          baseUrl: envConfig.baseUrl,
          timeout: envConfig.timeout,
        });
        this.purchaseService = new FikenPurchaseService({
          ...config,
          enableLogging: true,
          logLevel: process.env.LOG_LEVEL || 'info'
        });
        console.error('Fiken service auto-configured from environment variables');
      } catch (error) {
        console.error('Failed to auto-configure from environment:', error);
      }
    }
  }

  private async handleStatus(args: any) {
    const envConfig = getEnvConfig();
    const isConfigured = !!this.purchaseService;
    const hasDefaultCompanySlug = !!this.defaultCompanySlug;
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            configured: isConfigured,
            autoConfiguredFromEnv: isConfigured && !!envConfig.apiToken,
            hasApiToken: !!envConfig.apiToken,
            hasDefaultCompanySlug,
            defaultCompanySlug: this.defaultCompanySlug,
            environmentVariables: {
              FIKEN_API_TOKEN: envConfig.apiToken ? 'SET' : 'NOT SET',
              FIKEN_COMPANY_SLUG: envConfig.companySlug || 'NOT SET',
              FIKEN_BASE_URL: envConfig.baseUrl || 'NOT SET',
              FIKEN_TIMEOUT: envConfig.timeout ? envConfig.timeout.toString() : 'NOT SET'
            }
          }, null, 2),
        },
      ],
    };
  }

  private async handleConfigure(args: any) {
    const envConfig = getEnvConfig();
    
    // Merge environment variables with provided args, giving priority to args
    const mergedConfig = {
      apiToken: args.apiToken || envConfig.apiToken,
      baseUrl: args.baseUrl || envConfig.baseUrl,
      timeout: args.timeout || envConfig.timeout,
    };
    
    const config = ConfigSchema.parse(mergedConfig);
    this.purchaseService = new FikenPurchaseService({
      ...config,
      enableLogging: true,
      logLevel: process.env.LOG_LEVEL || 'info'
    });
    
    return {
      content: [
        {
          type: 'text',
          text: `Fiken Purchase Service configured successfully${envConfig.apiToken ? ' (using environment variables)' : ''}`,
        },
      ],
    };
  }

  private async handleGetPurchases(args: any) {
    this.ensureConfigured();
    
    const { companySlug, params } = args;
    const finalCompanySlug = companySlug || this.defaultCompanySlug;
    
    if (!finalCompanySlug) {
      throw new Error('Company slug is required. Provide it as parameter or set FIKEN_COMPANY_SLUG environment variable.');
    }
    
    CompanySlugSchema.parse(finalCompanySlug);
    
    const queryParams = params ? PurchaseQueryParamsSchema.parse(params) : undefined;
    
    const result = await this.purchaseService!.getPurchases(finalCompanySlug, queryParams);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async handleCreatePurchase(args: any) {
    this.ensureConfigured();
    
    const { companySlug, purchase } = args;
    const finalCompanySlug = companySlug || this.defaultCompanySlug;
    
    if (!finalCompanySlug) {
      throw new Error('Company slug is required. Provide it as parameter or set FIKEN_COMPANY_SLUG environment variable.');
    }
    
    CompanySlugSchema.parse(finalCompanySlug);
    const validatedPurchase = PurchaseRequestSchema.parse(purchase);
    
    const result = await this.purchaseService!.createPurchase(finalCompanySlug, validatedPurchase);
    
    return {
      content: [
        {
          type: 'text',
          text: `Purchase created successfully.`,
        },
      ],
    };
  }

  private async handleGetPurchase(args: any) {
    this.ensureConfigured();
    
    const { companySlug, purchaseId } = args;
    const finalCompanySlug = companySlug || this.defaultCompanySlug;
    
    if (!finalCompanySlug) {
      throw new Error('Company slug is required. Provide it as parameter or set FIKEN_COMPANY_SLUG environment variable.');
    }
    
    CompanySlugSchema.parse(finalCompanySlug);
    z.number().int().positive().parse(purchaseId);
    
    const result = await this.purchaseService!.getPurchase(finalCompanySlug, purchaseId);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async handleDeletePurchase(args: any) {
    this.ensureConfigured();
    
    const { companySlug, purchaseId, description } = args;
    const finalCompanySlug = companySlug || this.defaultCompanySlug;
    
    if (!finalCompanySlug) {
      throw new Error('Company slug is required. Provide it as parameter or set FIKEN_COMPANY_SLUG environment variable.');
    }
    
    CompanySlugSchema.parse(finalCompanySlug);
    z.number().int().positive().parse(purchaseId);
    z.string().min(1).parse(description);
    
    const result = await this.purchaseService!.deletePurchase(finalCompanySlug, purchaseId, description);
    
    return {
      content: [
        {
          type: 'text',
          text: `Purchase deleted successfully. Updated purchase: ${JSON.stringify(result.data, null, 2)}`,
        },
      ],
    };
  }

  private async handleCreatePurchaseDraft(args: any) {
    this.ensureConfigured();
    
    const { companySlug, draft } = args;
    const finalCompanySlug = companySlug || this.defaultCompanySlug;
    
    if (!finalCompanySlug) {
      throw new Error('Company slug is required. Provide it as parameter or set FIKEN_COMPANY_SLUG environment variable.');
    }
    
    CompanySlugSchema.parse(finalCompanySlug);
    const validatedDraft = DraftRequestSchema.parse(draft);
    
    const result = await this.purchaseService!.createPurchaseDraft(finalCompanySlug, validatedDraft);
    
    return {
      content: [
        {
          type: 'text',
          text: `Purchase draft created successfully.`,
        },
      ],
    };
  }

  private async handleCreatePurchasePayment(args: any) {
    this.ensureConfigured();
    
    const { companySlug, purchaseId, payment } = args;
    const finalCompanySlug = companySlug || this.defaultCompanySlug;
    
    if (!finalCompanySlug) {
      throw new Error('Company slug is required. Provide it as parameter or set FIKEN_COMPANY_SLUG environment variable.');
    }
    
    CompanySlugSchema.parse(finalCompanySlug);
    z.number().int().positive().parse(purchaseId);
    const validatedPayment = PaymentSchema.parse(payment);
    
    const result = await this.purchaseService!.createPurchasePayment(finalCompanySlug, purchaseId, validatedPayment);
    
    return {
      content: [
        {
          type: 'text',
          text: `Payment created successfully.`,
        },
      ],
    };
  }

  private async handleGetPurchaseDraft(args: any) {
    this.ensureConfigured();
    
    const { companySlug, draftId } = args;
    const finalCompanySlug = companySlug || this.defaultCompanySlug;
    
    if (!finalCompanySlug) {
      throw new Error('Company slug is required. Provide it as parameter or set FIKEN_COMPANY_SLUG environment variable.');
    }
    
    CompanySlugSchema.parse(finalCompanySlug);
    z.number().int().positive().parse(draftId);
    
    const result = await this.purchaseService!.getPurchaseDraft(finalCompanySlug, draftId);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private ensureConfigured(): void {
    if (!this.purchaseService) {
      throw new Error('Fiken service not configured. Please run fiken_configure first.');
    }
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Fiken MCP server running on stdio');
  }
}

const server = new FikenMCPServer();
server.run().catch(console.error);
