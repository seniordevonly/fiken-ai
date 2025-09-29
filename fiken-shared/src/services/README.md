# Fiken Purchase Service

The Fiken Purchase Service provides a comprehensive TypeScript interface for interacting with Fiken's purchase APIs. It implements all purchase-related endpoints from the Fiken API v2 specification.

## Features

- **Complete Purchase Management**: Create, read, update, and delete purchases
- **Draft Support**: Full support for purchase drafts
- **Attachment Handling**: Upload and manage purchase attachments
- **Payment Processing**: Handle purchase payments
- **Type Safety**: Full TypeScript support with proper type definitions
- **Error Handling**: Comprehensive error handling with meaningful messages
- **Pagination Support**: Built-in support for Fiken's pagination headers
- **Validation**: Input validation for all operations

## Installation

The service is part of the fiken-shared package:

```typescript
import { FikenPurchaseService, FikenConfig } from 'fiken-shared';
```

## Configuration

```typescript
const config: FikenConfig = {
  apiToken: 'your-fiken-api-token',
  baseUrl: 'https://api.fiken.no/api/v2', // Optional, defaults to Fiken API v2
  timeout: 30000 // Optional, defaults to 30 seconds
};

const purchaseService = new FikenPurchaseService(config);
```

## Usage Examples

### 1. Get All Purchases

```typescript
// Get all purchases for a company
const purchases = await purchaseService.getPurchases('my-company-slug');

// Get purchases with filters
const filteredPurchases = await purchaseService.getPurchases('my-company-slug', {
  page: 0,
  pageSize: 25,
  dateGe: '2024-01-01',
  dateLe: '2024-12-31',
  paid: false,
  sortBy: 'date desc'
});

console.log('Total purchases:', purchases.headers?.['Fiken-Api-Result-Count']);
```

### 2. Create a Purchase

```typescript
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
    }
  ],
  paid: false
};

await purchaseService.createPurchase('my-company-slug', newPurchase);
```

### 3. Work with Purchase Drafts

```typescript
// Create a draft
const draft: DraftRequest = {
  cash: false,
  currency: 'NOK',
  contactId: 12345,
  lines: [
    {
      description: 'Consulting services',
      netPrice: 100000, // 1000.00 NOK in cents
      vatType: 'HIGH',
      account: '4000'
    }
  ]
};

await purchaseService.createPurchaseDraft('my-company-slug', draft);

// Get all drafts
const drafts = await purchaseService.getPurchaseDrafts('my-company-slug');

// Update a draft
await purchaseService.updatePurchaseDraft('my-company-slug', draftId, updatedDraft);

// Delete a draft
await purchaseService.deletePurchaseDraft('my-company-slug', draftId);
```

### 4. Handle Attachments

```typescript
// Add attachment to a purchase
const attachment: AttachmentUpload = {
  filename: 'invoice.pdf',
  file: fileBuffer, // File or Buffer
  attachToSale: true,
  attachToPayment: false
};

await purchaseService.addAttachmentToPurchase('my-company-slug', purchaseId, attachment);

// Get all attachments for a purchase
const attachments = await purchaseService.getPurchaseAttachments('my-company-slug', purchaseId);
```

### 5. Manage Payments

```typescript
// Create a payment for a purchase
const payment: Payment = {
  date: '2024-01-20',
  account: '1920:10001',
  amount: 62500, // 625.00 NOK in cents
  currency: 'NOK'
};

await purchaseService.createPurchasePayment('my-company-slug', purchaseId, payment);

// Get all payments for a purchase
const payments = await purchaseService.getPurchasePayments('my-company-slug', purchaseId);
```

### 6. Delete a Purchase

```typescript
// Delete a purchase (creates reverse transaction)
await purchaseService.deletePurchase(
  'my-company-slug', 
  purchaseId, 
  'Cancelled due to supplier error'
);
```

## API Reference

### Purchase Operations

- `getPurchases(companySlug, params?)` - Get all purchases
- `createPurchase(companySlug, purchase)` - Create a new purchase
- `getPurchase(companySlug, purchaseId)` - Get a specific purchase
- `deletePurchase(companySlug, purchaseId, description)` - Delete a purchase

### Draft Operations

- `getPurchaseDrafts(companySlug, params?)` - Get all purchase drafts
- `createPurchaseDraft(companySlug, draft)` - Create a new draft
- `getPurchaseDraft(companySlug, draftId)` - Get a specific draft
- `updatePurchaseDraft(companySlug, draftId, draft)` - Update a draft
- `deletePurchaseDraft(companySlug, draftId)` - Delete a draft

### Attachment Operations

- `getPurchaseAttachments(companySlug, purchaseId)` - Get purchase attachments
- `addAttachmentToPurchase(companySlug, purchaseId, attachment)` - Add attachment to purchase
- `getPurchaseDraftAttachments(companySlug, draftId)` - Get draft attachments
- `addAttachmentToPurchaseDraft(companySlug, draftId, attachment)` - Add attachment to draft

### Payment Operations

- `getPurchasePayments(companySlug, purchaseId)` - Get purchase payments
- `createPurchasePayment(companySlug, purchaseId, payment)` - Create a payment
- `getPurchasePayment(companySlug, purchaseId, paymentId)` - Get a specific payment

## Error Handling

The service provides comprehensive error handling:

```typescript
try {
  await purchaseService.createPurchase('my-company-slug', invalidPurchase);
} catch (error) {
  if (error instanceof Error) {
    console.error('Purchase creation failed:', error.message);
  }
}
```

Common error scenarios:
- Invalid API token (401 Unauthorized)
- Missing required fields (400 Bad Request)
- Resource not found (404 Not Found)
- Rate limiting (429 Too Many Requests)
- Network timeouts

## Validation

The service includes built-in validation for:
- Required fields
- Data types
- Business rules (e.g., at least one attachment type must be specified)
- File extensions for attachments

## Rate Limiting

The Fiken API has rate limiting rules:
- Only one concurrent request allowed
- Maximum 4 requests per second
- The service includes automatic request ID generation for tracking

## Currency and Amounts

All monetary amounts are handled in cents (øre) as integers:
- 100.50 NOK = 10050 cents
- Always specify currency using ISO 4217 codes (e.g., 'NOK', 'EUR', 'USD')

## VAT Types

The service supports all Fiken VAT types:
- Common: `NONE`, `HIGH`, `MEDIUM`, `RAW_FISH`, `LOW`
- Sales only: `EXEMPT_IMPORT_EXPORT`, `EXEMPT`, `OUTSIDE`, `EXEMPT_REVERSE`
- Purchases only: `HIGH_DIRECT`, `HIGH_BASIS`, `MEDIUM_DIRECT`, etc.

## Date Formats

All dates use the format `yyyy-mm-dd` (ISO 8601 date format):
- Example: `'2024-01-15'`
