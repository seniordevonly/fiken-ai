/**
 * Example usage of the Fiken Purchase Service
 * 
 * This example demonstrates how to use the FikenPurchaseService
 * to interact with Fiken's purchase APIs.
 */

import { 
  FikenPurchaseService, 
  FikenConfig, 
  PurchaseRequest, 
  DraftRequest,
  Payment,
  AttachmentUpload 
} from '../src';

// Configuration
const config: FikenConfig = {
  apiToken: process.env.FIKEN_API_TOKEN || 'your-api-token-here',
  baseUrl: 'https://api.fiken.no/api/v2', // Optional
  timeout: 30000 // Optional
};

const purchaseService = new FikenPurchaseService(config);
const companySlug = 'your-company-slug';

async function exampleUsage() {
  try {
    console.log('🚀 Starting Fiken Purchase Service Examples\n');

    // ========== 1. GET PURCHASES ==========
    console.log('📋 Getting all purchases...');
    const purchases = await purchaseService.getPurchases(companySlug, {
      page: 0,
      pageSize: 10,
      sortBy: 'date desc'
    });
    
    console.log(`Found ${purchases.data.length} purchases`);
    if (purchases.headers) {
      console.log(`Total: ${purchases.headers['Fiken-Api-Result-Count']}`);
    }

    // ========== 2. CREATE PURCHASE ==========
    console.log('\n💰 Creating a new purchase...');
    const newPurchase: PurchaseRequest = {
      date: '2024-01-15',
      kind: 'supplier',
      currency: 'NOK',
      supplierId: 12345,
      identifier: 'INV-2024-001',
      lines: [
        {
          description: 'Office supplies',
          netPrice: 50000, // 500.00 NOK in cents
          vat: 12500, // 125.00 NOK in cents
          vatType: 'HIGH',
          account: '4000'
        },
        {
          description: 'Software license',
          netPrice: 100000, // 1000.00 NOK in cents
          vat: 25000, // 250.00 NOK in cents
          vatType: 'HIGH',
          account: '4100'
        }
      ],
      paid: false
    };

    await purchaseService.createPurchase(companySlug, newPurchase);
    console.log('✅ Purchase created successfully');

    // ========== 3. WORK WITH DRAFTS ==========
    console.log('\n📝 Working with purchase drafts...');
    
    // Create a draft
    const draft: DraftRequest = {
      cash: false,
      currency: 'NOK',
      contactId: 12345,
      invoiceNumber: 'DRAFT-001',
      paid: false, // required field - always set to false for new drafts
      lines: [
        {
          text: 'Consulting services',
          net: 200000, // 2000.00 NOK in cents
          gross: 250000, // 2500.00 NOK in cents (net + 25% VAT)
          vatType: 'HIGH',
          incomeAccount: '4000'
        }
      ]
    };

    await purchaseService.createPurchaseDraft(companySlug, draft);
    console.log('✅ Draft created successfully');

    // Get all drafts
    const drafts = await purchaseService.getPurchaseDrafts(companySlug);
    console.log(`Found ${drafts.data.length} drafts`);

    // ========== 4. HANDLE PAYMENTS ==========
    if (purchases.data.length > 0) {
      const purchaseId = purchases.data[0].purchaseId;
      
      console.log('\n💳 Adding payment to purchase...');
      const payment: Payment = {
        date: '2024-01-20',
        account: '1920:10001',
        amount: 62500, // 625.00 NOK in cents
        currency: 'NOK'
      };

      await purchaseService.createPurchasePayment(companySlug, purchaseId, payment);
      console.log('✅ Payment added successfully');

      // Get all payments for the purchase
      const payments = await purchaseService.getPurchasePayments(companySlug, purchaseId);
      console.log(`Purchase has ${payments.data.length} payments`);
    }

    // ========== 5. HANDLE ATTACHMENTS ==========
    if (purchases.data.length > 0) {
      const purchaseId = purchases.data[0].purchaseId;
      
      console.log('\n📎 Working with attachments...');
      
      // In a real scenario, you would have an actual file
      const mockFileContent = Buffer.from('Mock PDF content', 'utf-8');
      
      const attachment: AttachmentUpload = {
        filename: 'invoice.pdf',
        file: mockFileContent,
        attachToSale: true,
        attachToPayment: false
      };

      try {
        await purchaseService.addAttachmentToPurchase(companySlug, purchaseId, attachment);
        console.log('✅ Attachment added successfully');
      } catch (error) {
        console.log('⚠️ Attachment upload failed (expected with mock data)');
      }

      // Get all attachments
      const attachments = await purchaseService.getPurchaseAttachments(companySlug, purchaseId);
      console.log(`Purchase has ${attachments.data.length} attachments`);
    }

    // ========== 6. ADVANCED FILTERING ==========
    console.log('\n🔍 Advanced filtering examples...');
    
    // Get unpaid purchases from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const unpaidPurchases = await purchaseService.getPurchases(companySlug, {
      paid: false,
      dateGe: thirtyDaysAgo.toISOString().split('T')[0],
      sortBy: 'date desc'
    });
    
    console.log(`Found ${unpaidPurchases.data.length} unpaid purchases from last 30 days`);

    console.log('\n🎉 All examples completed successfully!');

  } catch (error) {
    console.error('❌ Error occurred:', error);
    
    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }
  }
}

// Helper function to demonstrate error handling
async function errorHandlingExample() {
  console.log('\n🚨 Error Handling Examples\n');

  try {
    // This will fail due to invalid company slug
    await purchaseService.getPurchases('');
  } catch (error) {
    console.log('✅ Caught validation error:', (error as Error).message);
  }

  try {
    // This will fail due to missing required fields
    const invalidPurchase = {} as PurchaseRequest;
    await purchaseService.createPurchase(companySlug, invalidPurchase);
  } catch (error) {
    console.log('✅ Caught validation error:', (error as Error).message);
  }

  try {
    // This will fail due to invalid attachment
    const invalidAttachment: AttachmentUpload = {
      filename: 'test.txt', // Invalid extension
      file: Buffer.from('test'),
      // Missing attachToSale and attachToPayment
    };
    await purchaseService.addAttachmentToPurchase(companySlug, 123, invalidAttachment);
  } catch (error) {
    console.log('✅ Caught validation error:', (error as Error).message);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  exampleUsage()
    .then(() => errorHandlingExample())
    .then(() => {
      console.log('\n✨ All examples completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Fatal error:', error);
      process.exit(1);
    });
}

export { exampleUsage, errorHandlingExample };
