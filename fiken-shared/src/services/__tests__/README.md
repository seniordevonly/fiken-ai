# Fiken Purchase Service Tests

This directory contains comprehensive unit tests for the Fiken Purchase Service.

## Test Coverage

The test suite covers:

### ✅ **Purchase Operations**
- `getPurchases()` - Get all purchases with and without query parameters
- `createPurchase()` - Create new purchases with validation
- `getPurchase()` - Get specific purchase by ID
- `deletePurchase()` - Delete purchases with description validation

### ✅ **Draft Operations**
- `createPurchaseDraft()` - Create purchase drafts with validation
- Draft-specific validation (cash field, lines array)

### ✅ **Payment Operations**
- `createPurchasePayment()` - Create payments for purchases
- Payment validation (date, account, amount)

### ✅ **Attachment Operations**
- `addAttachmentToPurchase()` - Add attachments with validation
- File extension validation (.pdf, .png, .jpg, .jpeg, .gif)
- Attachment type validation (attachToSale/attachToPayment)

### ✅ **Error Handling**
- API error responses
- Network failures
- Input validation errors
- Company slug validation

### ✅ **Input Validation**
- Purchase request validation
- Draft request validation
- Payment validation
- Attachment validation

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Test Structure

The tests use Jest with mocked fetch API to simulate HTTP requests. Key testing patterns:

### Mocking Strategy
- Global `fetch` mock for HTTP requests
- Response mocking with proper headers and status codes
- Error response simulation

### Test Categories
1. **Happy Path Tests** - Verify successful operations
2. **Validation Tests** - Ensure proper input validation
3. **Error Handling Tests** - Verify error scenarios are handled correctly
4. **Integration Tests** - Test complete workflows

### Example Test Structure

```typescript
describe('FikenPurchaseService', () => {
  describe('Purchase Operations', () => {
    describe('getPurchases', () => {
      it('should get all purchases for a company', async () => {
        // Arrange
        const mockData = [...];
        mockSuccessResponse(mockData);

        // Act
        const result = await service.getPurchases(companySlug);

        // Assert
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/purchases'),
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              'Authorization': 'Bearer test-token'
            })
          })
        );
        expect(result.data).toEqual(mockData);
      });
    });
  });
});
```

## Coverage Report

Current test coverage:
- **Statements**: ~54%
- **Branches**: ~54%
- **Functions**: ~56%
- **Lines**: ~55%

The coverage focuses on the core business logic and validation paths. Areas not covered include:
- Some error handling edge cases
- Utility methods in base service
- Type definitions (not executable code)

## Adding New Tests

When adding new functionality to the service:

1. **Add corresponding tests** for new methods
2. **Test both success and failure scenarios**
3. **Validate input parameters** are properly checked
4. **Mock HTTP responses** appropriately
5. **Update this documentation** with new test coverage

### Test Naming Convention

- Use descriptive test names: `should [expected behavior] when [condition]`
- Group related tests in `describe` blocks
- Use `it` for individual test cases

### Best Practices

- **Arrange, Act, Assert** pattern
- **Mock external dependencies** (HTTP requests)
- **Test edge cases** and error conditions
- **Keep tests focused** on single functionality
- **Use meaningful test data** that reflects real usage
