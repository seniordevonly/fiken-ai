/**
 * Simplified unit tests for FikenPurchaseService
 */

import { FikenPurchaseService } from '../fiken-purchase.service';
import {
  PurchaseRequest,
  PurchaseResult,
  DraftRequest,
  Payment,
  AttachmentUpload
} from '../../types/fiken.types';

// Mock fetch globally
global.fetch = jest.fn();

describe('FikenPurchaseService', () => {
  let service: FikenPurchaseService;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  const mockConfig = {
    apiToken: 'test-token',
    baseUrl: 'https://api.fiken.no/api/v2'
  };

  const companySlug = 'test-company';

  beforeEach(() => {
    mockFetch = fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockClear();
    
    service = new FikenPurchaseService(mockConfig);
  });

  const mockSuccessResponse = (data: any, status = 200) => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status,
      json: async () => data,
      text: async () => JSON.stringify(data),
      headers: {
        get: (name: string) => {
          if (name === 'content-type') return 'application/json';
          if (name === 'content-length') return data ? '100' : '0';
          return null;
        },
      },
    } as unknown as Response);
  };

  const mockErrorResponse = (status: number, message: string) => {
    mockFetch.mockRejectedValueOnce(new Error(`HTTP ${status}: ${message}`));
  };

  describe('Purchase Operations', () => {
    describe('getPurchases', () => {
      it('should get all purchases for a company', async () => {
        const mockData: PurchaseResult[] = [
          {
            purchaseId: 1,
            date: '2024-01-15',
            kind: 'supplier',
            paid: false,
            lines: [],
            currency: 'NOK'
          }
        ];

        mockSuccessResponse(mockData);

        const result = await service.getPurchases(companySlug);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(`/companies/${companySlug}/purchases`),
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              'Authorization': 'Bearer test-token'
            })
          })
        );
        expect(result.data).toEqual(mockData);
      });

      it('should handle query parameters', async () => {
        const params = { page: 0, pageSize: 25, paid: false };
        mockSuccessResponse([]);

        await service.getPurchases(companySlug, params);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('page=0&pageSize=25&paid=false'),
          expect.any(Object)
        );
      });
    });

    describe('createPurchase', () => {
      it('should create a new purchase', async () => {
        const purchase: PurchaseRequest = {
          date: '2024-01-15',
          kind: 'supplier',
          paid: false,
          currency: 'NOK',
          lines: [
            {
              description: 'Test item',
              vatType: 'HIGH',
              netPrice: 10000,
              vat: 2500
            }
          ]
        };

        mockSuccessResponse(undefined, 201);

        await service.createPurchase(companySlug, purchase);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(`/companies/${companySlug}/purchases`),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(purchase),
            headers: expect.objectContaining({
              'Authorization': 'Bearer test-token',
              'Content-Type': 'application/json'
            })
          })
        );
      });

      it('should validate purchase request', async () => {
        const invalidPurchase = {} as PurchaseRequest;

        await expect(service.createPurchase(companySlug, invalidPurchase))
          .rejects.toThrow('Purchase date is required');

        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('should validate required fields', async () => {
        const purchaseWithoutDate = {
          kind: 'supplier',
          currency: 'NOK',
          lines: []
        } as unknown as PurchaseRequest;

        await expect(service.createPurchase(companySlug, purchaseWithoutDate))
          .rejects.toThrow('Purchase date is required');
      });

      it('should validate lines array', async () => {
        const purchaseWithoutLines = {
          date: '2024-01-15',
          kind: 'supplier',
          paid: false,
          currency: 'NOK',
          lines: []
        } as PurchaseRequest;

        await expect(service.createPurchase(companySlug, purchaseWithoutLines))
          .rejects.toThrow('Purchase lines are required and must be a non-empty array');
      });

      it('should require an amount on each line', async () => {
        const purchaseWithoutAmount: PurchaseRequest = {
          date: '2024-01-15',
          kind: 'supplier',
          paid: false,
          currency: 'NOK',
          lines: [{ description: 'No amount', vatType: 'HIGH' }]
        };

        await expect(service.createPurchase(companySlug, purchaseWithoutAmount))
          .rejects.toThrow('Line 1: Either netPrice or netPriceInCurrency is required');
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('should default paid to false', async () => {
        const purchase = {
          date: '2024-01-15',
          kind: 'cash_purchase',
          currency: 'NOK',
          paymentAccount: '1920:10001',
          lines: [{ description: 'Coffee', vatType: 'MEDIUM', netPrice: 10000 }]
        } as unknown as PurchaseRequest;

        mockSuccessResponse(undefined, 201);

        await service.createPurchase(companySlug, purchase);

        const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
        expect(body.paid).toBe(false);
      });
    });

    describe('getPurchase', () => {
      it('should get a specific purchase', async () => {
        const purchaseId = 123;
        const mockData: PurchaseResult = {
          purchaseId,
          date: '2024-01-15',
          kind: 'supplier',
          paid: false,
          lines: [],
          currency: 'NOK'
        };

        mockSuccessResponse(mockData);

        const result = await service.getPurchase(companySlug, purchaseId);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(`/companies/${companySlug}/purchases/${purchaseId}`),
          expect.any(Object)
        );
        expect(result.data).toEqual(mockData);
      });
    });

    describe('deletePurchase', () => {
      it('should delete a purchase with description', async () => {
        const purchaseId = 123;
        const description = 'Cancelled order';
        const mockData: PurchaseResult = {
          purchaseId,
          date: '2024-01-15',
          kind: 'supplier',
          paid: false,
          lines: [],
          currency: 'NOK',
          deleted: true
        };

        mockSuccessResponse(mockData);

        const result = await service.deletePurchase(companySlug, purchaseId, description);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(`/companies/${companySlug}/purchases/${purchaseId}/delete`),
          expect.objectContaining({
            method: 'PATCH'
          })
        );
        expect(result.data).toEqual(mockData);
      });

      it('should validate description is provided', async () => {
        await expect(service.deletePurchase(companySlug, 123, ''))
          .rejects.toThrow('Description is required for deleting a purchase');

        expect(mockFetch).not.toHaveBeenCalled();
      });
    });
  });

  describe('Draft Operations', () => {
    describe('createPurchaseDraft', () => {
      it('should create a new purchase draft', async () => {
        const draft: DraftRequest = {
          cash: false,
          paid: false,
          lines: [
            {
              text: 'Test draft item',
              vatType: 'HIGH',
              incomeAccount: '4000',
              net: 100000,
              gross: 125000
            }
          ]
        };

        mockSuccessResponse(undefined, 201);

        await service.createPurchaseDraft(companySlug, draft);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(`/companies/${companySlug}/purchases/drafts`),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(draft)
          })
        );
      });

      it('should validate draft request', async () => {
        const invalidDraft = {} as DraftRequest;

        await expect(service.createPurchaseDraft(companySlug, invalidDraft))
          .rejects.toThrow('Draft cash field is required and must be a boolean');
      });

      it('should default paid to false', async () => {
        const draft = {
          cash: true,
          lines: [{ text: 'Coffee', vatType: 'MEDIUM', incomeAccount: '7140', net: 10000, gross: 11500 }]
        } as unknown as DraftRequest;

        mockSuccessResponse(undefined, 201);

        await service.createPurchaseDraft(companySlug, draft);

        const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
        expect(body.paid).toBe(false);
      });

      it('should validate cash field', async () => {
        const draftWithoutCash = {
          lines: []
        } as unknown as DraftRequest;

        await expect(service.createPurchaseDraft(companySlug, draftWithoutCash))
          .rejects.toThrow('Draft cash field is required and must be a boolean');
      });
    });
  });

  describe('Payment Operations', () => {
    describe('createPurchasePayment', () => {
      it('should create a purchase payment', async () => {
        const purchaseId = 123;
        const payment: Payment = {
          date: '2024-01-15',
          account: '1920:10001',
          amount: 50000
        };

        mockSuccessResponse(undefined, 201);

        await service.createPurchasePayment(companySlug, purchaseId, payment);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(`/companies/${companySlug}/purchases/${purchaseId}/payments`),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(payment)
          })
        );
      });

      it('should validate payment', async () => {
        const invalidPayment = {} as Payment;

        await expect(service.createPurchasePayment(companySlug, 123, invalidPayment))
          .rejects.toThrow('Payment date is required');
      });

      it('should validate payment fields', async () => {
        const paymentWithoutDate = {
          account: '1920:10001',
          amount: 50000
        } as unknown as Payment;

        await expect(service.createPurchasePayment(companySlug, 123, paymentWithoutDate))
          .rejects.toThrow('Payment date is required');
      });
    });
  });

  describe('Attachment Operations', () => {
    describe('addAttachmentToPurchase', () => {
      it('should validate attachment upload', async () => {
        const invalidAttachment = {} as AttachmentUpload;

        await expect(service.addAttachmentToPurchase(companySlug, 123, invalidAttachment))
          .rejects.toThrow('Attachment filename is required');
      });

      it('should validate filename extension', async () => {
        const attachmentWithInvalidExtension: AttachmentUpload = {
          filename: 'test.txt',
          file: Buffer.from('test'),
          attachToSale: true
        };

        await expect(service.addAttachmentToPurchase(companySlug, 123, attachmentWithInvalidExtension))
          .rejects.toThrow('Attachment filename must end with .png, .jpeg, .jpg, .gif, or .pdf');
      });

      it('should send attachToPayment and attachToSale as query parameters', async () => {
        mockSuccessResponse(undefined, 201);

        await service.addAttachmentToPurchase(companySlug, 123, {
          filename: 'receipt.pdf',
          file: Buffer.from('test'),
          attachToSale: true
        });

        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toContain(`/companies/${companySlug}/purchases/123/attachments?attachToSale=true`);
        const form = init!.body as FormData;
        expect(form.get('filename')).toBe('receipt.pdf');
        expect(form.has('attachToSale')).toBe(false);
      });

      it('should validate at least one attachment type is specified', async () => {
        const attachmentWithoutType: AttachmentUpload = {
          filename: 'test.pdf',
          file: Buffer.from('test')
        };

        await expect(service.addAttachmentToPurchase(companySlug, 123, attachmentWithoutType))
          .rejects.toThrow('At least one of attachToPayment or attachToSale must be true');
      });
    });
  });

  describe('addAttachmentToPurchaseDraft', () => {
    it('should upload filename and file only, without attach flags', async () => {
      mockSuccessResponse(undefined, 201);

      await service.addAttachmentToPurchaseDraft(companySlug, 7, {
        filename: 'invoice.pdf',
        file: Buffer.from('test')
      });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toMatch(new RegExp(`/companies/${companySlug}/purchases/drafts/7/attachments$`));
      const form = init!.body as FormData;
      expect(form.get('filename')).toBe('invoice.pdf');
      expect(form.get('file')).toBeInstanceOf(Blob);
      expect(form.has('attachToSale')).toBe(false);
      expect(form.has('attachToPayment')).toBe(false);
    });
  });

  describe('Draft, payment and accrual reads and actions', () => {
    const lastCall = () => {
      const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      return { url: String(url), method: init!.method, body: init!.body };
    };

    it('lists purchase drafts with pagination params', async () => {
      mockSuccessResponse([]);

      await service.getPurchaseDrafts(companySlug, { page: 1, pageSize: 50 });

      expect(lastCall()).toMatchObject({ method: 'GET' });
      expect(lastCall().url).toContain(`/companies/${companySlug}/purchases/drafts?page=1&pageSize=50`);
    });

    it('updates a purchase draft with PUT', async () => {
      mockSuccessResponse(undefined, 201);
      const draft: DraftRequest = {
        cash: true,
        paid: false,
        lines: [{ text: 'Coffee', vatType: 'MEDIUM', incomeAccount: '7140', net: 10000, gross: 11500 }]
      };

      await service.updatePurchaseDraft(companySlug, 45, draft);

      expect(lastCall()).toMatchObject({ method: 'PUT', body: JSON.stringify(draft) });
      expect(lastCall().url).toMatch(/\/purchases\/drafts\/45$/);
    });

    it('creates a purchase from a draft', async () => {
      mockSuccessResponse(undefined, 201);

      await service.createPurchaseFromDraft(companySlug, 45);

      expect(lastCall()).toMatchObject({ method: 'POST' });
      expect(lastCall().url).toMatch(/\/purchases\/drafts\/45\/createPurchase$/);
    });

    it('rejects an invalid draftId', async () => {
      await expect(service.createPurchaseFromDraft(companySlug, 0))
        .rejects.toThrow('draftId is required and must be a positive integer');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('gets one payment of a purchase', async () => {
      mockSuccessResponse({ paymentId: 9, date: '2024-01-20', account: '1920:10001', amount: 12500 });

      await service.getPurchasePayment(companySlug, 123, 9);

      expect(lastCall().url).toMatch(/\/purchases\/123\/payments\/9$/);
    });

    it('lists, gets and creates accruals', async () => {
      mockSuccessResponse([]);
      await service.getPurchaseAccruals(companySlug, 123);
      expect(lastCall().url).toMatch(/\/purchases\/123\/accruals$/);

      mockSuccessResponse({ accrualId: 5 });
      await service.getPurchaseAccrual(companySlug, 123, 5);
      expect(lastCall().url).toMatch(/\/purchases\/123\/accruals\/5$/);

      mockSuccessResponse(undefined, 201);
      const accrual = { lineId: 77, startDate: '2024-01-01', periods: 12, account: '1749' as const };
      await service.createPurchaseAccrual(companySlug, 123, accrual);
      expect(lastCall()).toMatchObject({ method: 'POST', body: JSON.stringify(accrual) });
    });

    it('validates accrual periods', async () => {
      await expect(service.createPurchaseAccrual(companySlug, 123, {
        lineId: 77, startDate: '2024-01-01', periods: 121, account: '1749'
      })).rejects.toThrow('Accrual periods must be an integer from 1 to 120');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors', async () => {
      mockErrorResponse(404, 'Not Found');

      await expect(service.getPurchases(companySlug))
        .rejects.toThrow('HTTP 404: Not Found');
    });

    it('should validate company slug', async () => {
      await expect(service.getPurchases(''))
        .rejects.toThrow('Company slug is required and must be a string');
    });
  });

  describe('Input Validation', () => {
    it('should pass validation for valid purchase', async () => {
      const validPurchase: PurchaseRequest = {
        date: '2024-01-15',
        kind: 'supplier',
        paid: false,
        currency: 'NOK',
        lines: [
          {
            description: 'Valid item',
            vatType: 'HIGH',
            netPriceInCurrency: 6800
          }
        ]
      };

      mockSuccessResponse(undefined, 201);

      await expect(service.createPurchase(companySlug, validPurchase))
        .resolves.toBeDefined();
    });

    it('should pass validation for valid draft', async () => {
      const validDraft: DraftRequest = {
        cash: false,
        paid: false,
        lines: [
          {
            text: 'Valid draft item',
            vatType: 'HIGH',
            incomeAccount: '4000',
            net: 100000,
            gross: 125000
          }
        ]
      };

      mockSuccessResponse(undefined, 201);

      await expect(service.createPurchaseDraft(companySlug, validDraft))
        .resolves.toBeDefined();
    });

    it('should pass validation for valid payment', async () => {
      const validPayment: Payment = {
        date: '2024-01-15',
        account: '1920:10001',
        amount: 50000
      };

      mockSuccessResponse(undefined, 201);

      await expect(service.createPurchasePayment(companySlug, 123, validPayment))
        .resolves.toBeDefined();
    });

    it('should pass validation for valid attachment', async () => {
      const validAttachment: AttachmentUpload = {
        filename: 'invoice.pdf',
        file: Buffer.from('test'),
        attachToSale: true
      };

      mockSuccessResponse(undefined, 201);

      await expect(service.addAttachmentToPurchase(companySlug, 123, validAttachment))
        .resolves.toBeDefined();
    });
  });
});
