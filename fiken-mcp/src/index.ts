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
import fs from 'node:fs/promises';
import http from 'node:http';
import url from 'node:url';

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

const PaymentSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  account: z.string().min(1, 'Account is required'),
  amount: z.number().int().positive('Amount must be positive'),
  amountInNok: z.number().int().positive().optional(),
  currency: z.string().length(3).optional(),
  fee: z.number().int().optional(),
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
  payments: z.array(PaymentSchema).optional(),
  lines: z.array(z.object({
    text: z.string().min(1, 'Line text is required').max(200, 'Text must be 200 characters or less'),
    vatType: VatTypeEnum,
    incomeAccount: z.string().min(1, 'Income account is required'),
    net: z.number().int().min(0, 'Net amount must be non-negative'),
    gross: z.number().int().min(0, 'Gross amount must be non-negative'),
    projectId: z.number().int().positive().optional(),
  })).min(1, 'At least one line is required'),
}).refine((data) => {
  // When paid is true, payments array is required and must have at least one payment
  if (data.paid && (!data.payments || data.payments.length === 0)) {
    return false;
  }
  return true;
}, {
  message: 'When paid is true, at least one payment is required',
  path: ['payments'],
});

class FikenMCPServer {
  private server: Server;
  private purchaseService: FikenPurchaseService | null = null;
  private defaultCompanySlug: string | null = null;
  private tools: Tool[] = [];

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
    this.initializeTools();
    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private initializeTools(): void {
    // Use the same detailed tool definitions as in setupToolHandlers
    // This ensures consistency between HTTP and STDIO modes
    this.tools = [];
  }

  private getToolsList(): Tool[] {
    return [
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
                currency: { type: 'string', description: '3-letter ISO currency code (optional)' },
                invoiceIssueDate: { type: 'string', description: 'Invoice issue date (YYYY-MM-DD, optional)' },
                dueDate: { type: 'string', description: 'Due date (YYYY-MM-DD, optional)' },
                invoiceNumber: { type: 'string', description: 'Invoice number (optional)' },
                contactId: { type: 'number', description: 'Contact ID (optional)' },
                projectId: { type: 'number', description: 'Project ID (optional)' },
                kid: { type: 'string', description: 'KID reference (optional)' },
                paid: { type: 'boolean', description: 'Whether the draft is paid (defaults to false)' },
                payments: {
                  type: 'array',
                  description: 'Required when paid=true. One or more payment bookings.',
                  items: {
                    type: 'object',
                    properties: {
                      date: { type: 'string', description: 'Payment date (YYYY-MM-DD)' },
                      account: { type: 'string', description: 'Payment account (e.g. 1920:10001)' },
                      amount: { type: 'number', description: 'Amount in cents (or minor units)' },
                      amountInNok: { type: 'number', description: 'Amount in NOK cents (optional, for foreign currency payments)' },
                      currency: { type: 'string', description: '3-letter ISO currency code (optional, defaults to NOK)' },
                      fee: { type: 'number', description: 'Transaction fee in cents (optional, can be negative)' }
                    },
                    required: ['date', 'account', 'amount'],
                    additionalProperties: false
                  },
                },
                lines: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      text: { type: 'string', description: 'Line text (required, max 200 chars)' },
                      vatType: { type: 'string', description: 'VAT type (e.g., HIGH, MEDIUM, LOW)' },
                      incomeAccount: { type: 'string', description: 'Income account (required)' },
                      net: { type: 'number', description: 'Net amount in cents (non-negative)' },
                      gross: { type: 'number', description: 'Gross amount in cents (non-negative)' },
                      projectId: { type: 'number', description: 'Project ID for this line (optional)' },
                    },
                    required: ['text', 'vatType', 'incomeAccount', 'net', 'gross'],
                  },
                },
              },
              required: ['cash', 'lines'],
              additionalProperties: false
            },
          },
          required: ['draft'],
          additionalProperties: false
        },
      },
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
        name: 'fiken_get_purchase_draft_attachments',
        description: 'Get all attachments for a purchase draft',
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
        name: 'fiken_add_attachment_to_purchase_draft',
        description: 'Add an attachment to a purchase draft',
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
            attachment: {
              type: 'object',
              properties: {
                filename: { type: 'string', description: 'Filename to use for the attachment' },
                filePath: { type: 'string', description: 'Absolute or relative path to the file on disk' },
                contentType: { type: 'string', description: 'Optional MIME type of the file' },
                attachToPayment: { type: 'boolean', description: 'Whether to attach to payment if applicable' },
              },
              required: ['filename', 'filePath'],
            },
          },
          required: ['draftId', 'attachment'],
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
    ] as Tool[];
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
        tools: this.getToolsList()
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
          case 'fiken_get_purchase_draft_attachments':
            return await this.handleGetPurchaseDraftAttachments(args);
          case 'fiken_add_attachment_to_purchase_draft':
            return await this.handleAddAttachmentToPurchaseDraft(args);
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

  private async handleGetPurchaseDraftAttachments(args: any) {
    this.ensureConfigured();
    
    const { companySlug, draftId } = args;
    const finalCompanySlug = companySlug || this.defaultCompanySlug;
    
    if (!finalCompanySlug) {
      throw new Error('Company slug is required. Provide it as parameter or set FIKEN_COMPANY_SLUG environment variable.');
    }
    
    CompanySlugSchema.parse(finalCompanySlug);
    z.number().int().positive().parse(draftId);
    
    const result = await this.purchaseService!.getPurchaseDraftAttachments(finalCompanySlug, draftId);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async handleAddAttachmentToPurchaseDraft(args: any) {
    this.ensureConfigured();
    
    const { companySlug, draftId, attachment } = args;
    const finalCompanySlug = companySlug || this.defaultCompanySlug;
    
    if (!finalCompanySlug) {
      throw new Error('Company slug is required. Provide it as parameter or set FIKEN_COMPANY_SLUG environment variable.');
    }
    
    CompanySlugSchema.parse(finalCompanySlug);
    z.number().int().positive().parse(draftId);
    
    // Validate attachment shape
    const AttachmentInputSchema = z.object({
      filename: z.string().min(1),
      filePath: z.string().min(1),
      contentType: z.string().optional(),
      attachToPayment: z.boolean().optional(),
    });
    const att = AttachmentInputSchema.parse(attachment);
    
    // Read file from disk
    const fileBuffer = await fs.readFile(att.filePath);

    const upload = {
      filename: att.filename,
      file: fileBuffer,
      attachToPayment: att.attachToPayment,
    };
    
    await this.purchaseService!.addAttachmentToPurchaseDraft(finalCompanySlug, draftId, upload);
    
    return {
      content: [
        {
          type: 'text',
          text: 'Attachment uploaded to purchase draft successfully.',
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
    logger.info('Creating purchase draft', { draft });

    const validatedDraft = DraftRequestSchema.parse(draft);
    logger.info('Creating purchase draft, validatedDraft', { validatedDraft });
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

  private async handleMcpOverHttp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          const mcpRequest = JSON.parse(body);
          console.error('MCP Request:', JSON.stringify(mcpRequest, null, 2));
          let mcpResponse;
          
          // Handle MCP requests
          if (mcpRequest.method === 'initialize') {
            // Handle MCP initialization
            mcpResponse = {
              jsonrpc: '2.0',
              id: mcpRequest.id,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: {
                  tools: {},
                  authentication: {
                    oauth2: {
                      authorizationUrl: `https://${req.headers.host}/oauth/authorize`,
                      tokenUrl: `https://${req.headers.host}/oauth/token`,
                      scopes: ['fiken:read', 'fiken:write']
                    }
                  }
                },
                serverInfo: {
                  name: 'fiken-mcp',
                  version: '0.1.0',
                  authentication: 'oauth2'
                }
              }
            };
          } else if (mcpRequest.method === 'notifications/initialized') {
            // Handle initialized notification (no response needed)
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(200);
            res.end();
            return;
          } else if (mcpRequest.method === 'tools/list') {
            // Return the same detailed tools list as STDIO mode
            mcpResponse = {
              jsonrpc: '2.0',
              id: mcpRequest.id,
              result: {
                tools: this.getToolsList()
              }
            };
          } else if (mcpRequest.method === 'tools/call') {
            // Handle tool calls - execute the actual tool
            try {
              const { name, arguments: args } = mcpRequest.params;
              let toolResult;

              switch (name) {
                case 'fiken_status':
                  toolResult = await this.handleStatus(args);
                  break;
                case 'fiken_configure':
                  toolResult = await this.handleConfigure(args);
                  break;
                case 'fiken_get_purchases':
                  toolResult = await this.handleGetPurchases(args);
                  break;
                case 'fiken_create_purchase':
                  toolResult = await this.handleCreatePurchase(args);
                  break;
                case 'fiken_get_purchase':
                  toolResult = await this.handleGetPurchase(args);
                  break;
                case 'fiken_delete_purchase':
                  toolResult = await this.handleDeletePurchase(args);
                  break;
                case 'fiken_create_purchase_draft':
                  toolResult = await this.handleCreatePurchaseDraft(args);
                  break;
                case 'fiken_get_purchase_draft':
                  toolResult = await this.handleGetPurchaseDraft(args);
                  break;
                case 'fiken_get_purchase_draft_attachments':
                  toolResult = await this.handleGetPurchaseDraftAttachments(args);
                  break;
                case 'fiken_add_attachment_to_purchase_draft':
                  toolResult = await this.handleAddAttachmentToPurchaseDraft(args);
                  break;
                case 'fiken_create_purchase_payment':
                  toolResult = await this.handleCreatePurchasePayment(args);
                  break;
                default:
                  throw new Error(`Unknown tool: ${name}`);
              }

              mcpResponse = {
                jsonrpc: '2.0',
                id: mcpRequest.id,
                result: toolResult
              };
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
              mcpResponse = {
                jsonrpc: '2.0',
                id: mcpRequest.id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: `Error: ${errorMessage}`,
                    },
                  ],
                  isError: true,
                }
              };
            }
          } else {
            mcpResponse = {
              jsonrpc: '2.0',
              id: mcpRequest.id,
              error: {
                code: -32601,
                message: 'Method not found'
              }
            };
          }
          
          console.error('MCP Response:', JSON.stringify(mcpResponse, null, 2));
          res.setHeader('Content-Type', 'application/json');
          res.writeHead(200);
          res.end(JSON.stringify(mcpResponse));
        } catch (error) {
          res.setHeader('Content-Type', 'application/json');
          res.writeHead(400);
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32700,
              message: 'Parse error'
            }
          }));
        }
      });
    } catch (error) {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(500);
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Internal error'
        }
      }));
    }
  }

  private getOpenApiSpec() {
    return {
      openapi: '3.0.0',
      info: {
        title: 'Fiken MCP Server',
        version: '0.1.0',
        description: 'Fiken API tools via MCP protocol'
      },
      servers: [
        {
          url: 'https://fiken-ai-dev-5bab4c9f4bc4.herokuapp.com',
          description: 'Fiken MCP Server'
        }
      ],
      paths: {
        '/mcp': {
          post: {
            summary: 'MCP Protocol Endpoint',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      jsonrpc: { type: 'string', example: '2.0' },
                      id: { type: 'number', example: 1 },
                      method: { type: 'string', example: 'tools/list' },
                      params: { type: 'object' }
                    }
                  }
                }
              }
            },
            responses: {
              '200': {
                description: 'MCP Response',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object'
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
  }

  private ensureConfigured(): void {
    if (!this.purchaseService) {
      throw new Error('Fiken service not configured. Please run fiken_configure first.');
    }
  }

  private generateAccessToken(): string {
    // Generate a secure access token (JWT-like format)
    const payload = {
      iss: 'fiken-mcp-server',
      aud: 'chatgpt',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
      scope: 'fiken:read fiken:write'
    };
    
    // Simple token format (in production, use proper JWT)
    const tokenData = Buffer.from(JSON.stringify(payload)).toString('base64');
    return `fiken_${tokenData}_${Date.now()}`;
  }

  private validateOAuthCredentials(clientId: string, clientSecret: string): boolean {
    const validClientId = process.env.OAUTH_CLIENT_ID || 'fiken-mcp-client';
    const validClientSecret = process.env.OAUTH_CLIENT_SECRET || 'fiken-mcp-secret-2024';
    
    return clientId === validClientId && clientSecret === validClientSecret;
  }

  private validateAccessToken(token: string): boolean {
    if (!token || !token.startsWith('fiken_')) {
      return false;
    }
    
    try {
      const parts = token.split('_');
      if (parts.length !== 3) return false;
      
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      const now = Math.floor(Date.now() / 1000);
      
      // Check if token is expired
      return payload.exp > now;
    } catch (error) {
      return false;
    }
  }

  private authenticateRequest(req: http.IncomingMessage): boolean {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return false;
    }
    
    const token = authHeader.substring(7);
    return this.validateAccessToken(token);
  }

  private sendAuthError(res: http.ServerResponse): void {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(401);
    res.end(JSON.stringify({
      error: 'invalid_token',
      error_description: 'The access token provided is expired, revoked, malformed, or invalid.'
    }));
  }

  private async handleMcpOverHttpWithAuth(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          const mcpRequest = JSON.parse(body);
          
          // Allow initialize method without authentication for OAuth discovery
          if (mcpRequest.method === 'initialize') {
            // Handle initialize directly without calling handleMcpOverHttp to avoid body re-reading
            const mcpResponse = {
              jsonrpc: '2.0',
              id: mcpRequest.id,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: {
                  tools: {},
                  authentication: {
                    type: 'oauth2',
                    oauth2: {
                      issuer: `https://${req.headers.host}`,
                      authorizationEndpoint: `https://${req.headers.host}/oauth/authorize`,
                      tokenEndpoint: `https://${req.headers.host}/oauth/token`,
                      grantTypes: ['client_credentials'],
                      scopes: ['fiken:read', 'fiken:write'],
                      clientAuthenticationMethods: ['client_secret_post', 'client_secret_basic']
                    }
                  }
                },
                serverInfo: {
                  name: 'fiken-mcp',
                  version: '0.1.0',
                  authentication: {
                    type: 'oauth2',
                    required: true
                  }
                }
              }
            };
            
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(200);
            res.end(JSON.stringify(mcpResponse));
            return;
          }
          
          // All other methods require authentication
          if (!this.authenticateRequest(req)) {
            this.sendAuthError(res);
            return;
          }
          
          // Handle authenticated MCP request by processing the parsed request
          await this.processMcpRequest(mcpRequest, res);
          
        } catch (error) {
          res.setHeader('Content-Type', 'application/json');
          res.writeHead(400);
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32700,
              message: 'Parse error'
            }
          }));
        }
      });
      
    } catch (error) {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(500);
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Internal error'
        }
      }));
    }
  }

  private async processMcpRequest(mcpRequest: any, res: http.ServerResponse): Promise<void> {
    let mcpResponse;
    
    // Handle MCP requests
    if (mcpRequest.method === 'initialize') {
      // Handle MCP initialization
      mcpResponse = {
        jsonrpc: '2.0',
        id: mcpRequest.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            authentication: {
              type: 'oauth2',
              oauth2: {
                issuer: `https://fiken-ai.regnmedoss.no`,
                authorizationEndpoint: `https://fiken-ai.regnmedoss.no/oauth/authorize`,
                tokenEndpoint: `https://fiken-ai.regnmedoss.no/oauth/token`,
                grantTypes: ['client_credentials'],
                scopes: ['fiken:read', 'fiken:write'],
                clientAuthenticationMethods: ['client_secret_post', 'client_secret_basic']
              }
            }
          },
          serverInfo: {
            name: 'fiken-mcp',
            version: '0.1.0',
            authentication: {
              type: 'oauth2',
              required: true
            }
          }
        }
      };
    } else if (mcpRequest.method === 'notifications/initialized') {
      // Handle initialized notification (no response needed)
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end();
      return;
    } else if (mcpRequest.method === 'tools/list') {
      // Return the same detailed tools list as STDIO mode
      mcpResponse = {
        jsonrpc: '2.0',
        id: mcpRequest.id,
        result: {
          tools: this.getToolsList()
        }
      };
    } else if (mcpRequest.method === 'tools/call') {
      // Handle tool calls - execute the actual tool
      try {
        const { name, arguments: args } = mcpRequest.params;
        let toolResult;

        switch (name) {
          case 'fiken_status':
            toolResult = await this.handleStatus(args);
            break;
          case 'fiken_configure':
            toolResult = await this.handleConfigure(args);
            break;
          case 'fiken_get_purchases':
            toolResult = await this.handleGetPurchases(args);
            break;
          case 'fiken_create_purchase':
            toolResult = await this.handleCreatePurchase(args);
            break;
          case 'fiken_get_purchase':
            toolResult = await this.handleGetPurchase(args);
            break;
          case 'fiken_delete_purchase':
            toolResult = await this.handleDeletePurchase(args);
            break;
          case 'fiken_create_purchase_draft':
            toolResult = await this.handleCreatePurchaseDraft(args);
            break;
          case 'fiken_get_purchase_draft':
            toolResult = await this.handleGetPurchaseDraft(args);
            break;
          case 'fiken_get_purchase_draft_attachments':
            toolResult = await this.handleGetPurchaseDraftAttachments(args);
            break;
          case 'fiken_add_attachment_to_purchase_draft':
            toolResult = await this.handleAddAttachmentToPurchaseDraft(args);
            break;
          case 'fiken_create_purchase_payment':
            toolResult = await this.handleCreatePurchasePayment(args);
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        mcpResponse = {
          jsonrpc: '2.0',
          id: mcpRequest.id,
          result: toolResult
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        mcpResponse = {
          jsonrpc: '2.0',
          id: mcpRequest.id,
          result: {
            content: [
              {
                type: 'text',
                text: `Error: ${errorMessage}`,
              },
            ],
            isError: true,
          }
        };
      }
    } else {
      // Unknown method
      mcpResponse = {
        jsonrpc: '2.0',
        id: mcpRequest.id,
        error: {
          code: -32601,
          message: 'Method not found'
        }
      };
    }
    
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(mcpResponse));
  }

  private async handleOAuthToken(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', () => {
        try {
          // Parse form data or JSON
          let params: any;
          const contentType = req.headers['content-type'] || '';
          
          if (contentType.includes('application/x-www-form-urlencoded')) {
            params = new URLSearchParams(body);
            params = Object.fromEntries(params.entries());
          } else {
            params = JSON.parse(body);
          }
          
          const { grant_type, client_id, client_secret } = params;
          
          // Validate grant type
          if (grant_type !== 'client_credentials') {
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(400);
            res.end(JSON.stringify({
              error: 'unsupported_grant_type',
              error_description: 'Only client_credentials grant type is supported'
            }));
            return;
          }
          
          // Validate client credentials
          if (!this.validateOAuthCredentials(client_id, client_secret)) {
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(401);
            res.end(JSON.stringify({
              error: 'invalid_client',
              error_description: 'Invalid client credentials'
            }));
            return;
          }
          
          // Generate access token
          const accessToken = this.generateAccessToken();
          
          // Return token response
          res.setHeader('Content-Type', 'application/json');
          res.writeHead(200);
          res.end(JSON.stringify({
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: 86400, // 24 hours
            scope: 'fiken:read fiken:write'
          }));
          
        } catch (error) {
          res.setHeader('Content-Type', 'application/json');
          res.writeHead(400);
          res.end(JSON.stringify({
            error: 'invalid_request',
            error_description: 'Invalid request format'
          }));
        }
      });
      
    } catch (error) {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(500);
      res.end(JSON.stringify({
        error: 'server_error',
        error_description: 'Internal server error'
      }));
    }
  }

  async run(): Promise<void> {
    // Start MCP server on stdio for local development
    if (!process.env.PORT) {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error('Fiken MCP server running on stdio');
      return;
    }

    // Start HTTP server for Heroku deployment
    const port = parseInt(process.env.PORT || '3000', 10);
    const httpServer = http.createServer(async (req, res) => {
      // Enable CORS for ChatGPT
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
      
      const parsedUrl = url.parse(req.url!, true);
      
      // Public endpoints (no authentication required)
      if (req.method === 'GET' && parsedUrl.pathname === '/') {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify({
          name: 'Fiken MCP Server',
          version: '0.1.0',
          status: 'running',
          authentication: 'oauth2',
          token_endpoint: '/oauth/token',
          oauth_discovery: '/.well-known/oauth-authorization-server',
          tools: this.getToolsList().map(tool => tool.name),
          protocols: ['mcp', 'http']
        }));
      } else if (req.method === 'GET' && parsedUrl.pathname === '/health') {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'healthy' }));
      } else if (req.method === 'GET' && parsedUrl.pathname === '/.well-known/oauth-authorization-server') {
        // OAuth 2.0 Discovery Endpoint
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify({
          issuer: `https://${req.headers.host}`,
          token_endpoint: `https://${req.headers.host}/oauth/token`,
          grant_types_supported: ['client_credentials'],
          token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
          scopes_supported: ['fiken:read', 'fiken:write'],
          response_types_supported: ['token']
        }));
      } else if (req.method === 'GET' && parsedUrl.pathname === '/.well-known/openid-configuration') {
        // OpenID Connect Discovery Endpoint (what ChatGPT actually looks for)
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify({
          issuer: `https://${req.headers.host}`,
          token_endpoint: `https://${req.headers.host}/oauth/token`,
          grant_types_supported: ['client_credentials'],
          token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
          scopes_supported: ['fiken:read', 'fiken:write'],
          response_types_supported: ['token'],
          subject_types_supported: ['public']
        }));
      } else if (req.method === 'GET' && parsedUrl.pathname === '/oauth/authorize') {
        // OAuth 2.0 Authorization Endpoint (for completeness, though not used in client credentials flow)
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(400);
        res.end(JSON.stringify({
          error: 'unsupported_response_type',
          error_description: 'This server only supports client_credentials grant type. Use the token endpoint directly.'
        }));
      } else if (req.method === 'POST' && parsedUrl.pathname === '/oauth/token') {
        // OAuth 2.0 Token Endpoint
        await this.handleOAuthToken(req, res);
      } else if (req.method === 'GET' && parsedUrl.pathname === '/mcp/.well-known/oauth-authorization-server') {
        // OAuth 2.0 Discovery Endpoint under MCP path
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify({
          issuer: `https://${req.headers.host}`,
          token_endpoint: `https://${req.headers.host}/oauth/token`,
          grant_types_supported: ['client_credentials'],
          token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
          scopes_supported: ['fiken:read', 'fiken:write'],
          response_types_supported: ['token']
        }));
      } else if (req.method === 'GET' && parsedUrl.pathname === '/mcp/.well-known/openid-configuration') {
        // OpenID Connect Discovery Endpoint under MCP path (what ChatGPT looks for)
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify({
          issuer: `https://${req.headers.host}`,
          token_endpoint: `https://${req.headers.host}/oauth/token`,
          grant_types_supported: ['client_credentials'],
          token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
          scopes_supported: ['fiken:read', 'fiken:write'],
          response_types_supported: ['token'],
          subject_types_supported: ['public']
        }));
      } else if (req.method === 'POST' && parsedUrl.pathname === '/mcp') {
        // Handle MCP protocol over HTTP with conditional authentication
        await this.handleMcpOverHttpWithAuth(req, res);
      } else if (req.method === 'GET' && parsedUrl.pathname === '/openapi.json') {
        // Protected endpoint - require OAuth authentication
        if (!this.authenticateRequest(req)) {
          this.sendAuthError(res);
          return;
        }
        // Provide OpenAPI spec as alternative
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify(this.getOpenApiSpec()));
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    httpServer.listen(port, () => {
      console.error(`Fiken MCP server running on HTTP port ${port}`);
    });
  }
}

const server = new FikenMCPServer();
server.run().catch(console.error);
