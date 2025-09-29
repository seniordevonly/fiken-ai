# Logging Framework Documentation

The fiken-shared project now includes a comprehensive logging framework built on Winston that provides structured logging for HTTP requests, responses, and general application events.

## Features

- ✅ **Structured Logging**: JSON-formatted logs with consistent structure
- ✅ **HTTP Request/Response Logging**: Automatic logging of all API calls
- ✅ **HTTP Headers Logging**: Complete request headers with sanitization
- ✅ **Data Sanitization**: Sensitive information is automatically redacted
- ✅ **Request Tracking**: Unique request IDs for tracing requests
- ✅ **Performance Monitoring**: Request duration measurement
- ✅ **Error Handling**: Comprehensive error logging with stack traces
- ✅ **Configurable Levels**: Support for debug, info, warn, error levels
- ✅ **Multiple Outputs**: Console and file logging support
- ✅ **Child Loggers**: Context-aware logging with metadata

## Quick Start

### Basic Usage

```typescript
import { logger } from 'fiken-shared';

// Simple logging
logger.info('Application started');
logger.warn('This is a warning');
logger.error('An error occurred', new Error('Sample error'));
```

### HTTP Request Logging

HTTP requests are automatically logged when using the `FikenPurchaseService`:

```typescript
import { FikenPurchaseService } from 'fiken-shared';

const service = new FikenPurchaseService({
  apiToken: 'your-token',
  enableLogging: true,  // Enable HTTP logging
  logLevel: 'debug'     // Set log level
});

// All HTTP requests will now be logged automatically
const purchases = await service.getPurchases('company-slug');
```

### Custom Logger Configuration

```typescript
import { createLogger } from 'fiken-shared';

const customLogger = createLogger({
  level: 'debug',
  serviceName: 'my-service',
  enableConsole: true,
  enableFile: true,
  logDir: './logs'
});

customLogger.info('Custom logger message');
```

## Configuration Options

### Logger Configuration

```typescript
interface LoggerConfig {
  level?: string;           // Log level: 'debug', 'info', 'warn', 'error'
  enableConsole?: boolean;  // Enable console output (default: true)
  enableFile?: boolean;     // Enable file output (default: false)
  logDir?: string;         // Directory for log files (default: './logs')
  serviceName?: string;    // Service name for log context
}
```

### Fiken Service Configuration

```typescript
interface FikenConfig {
  apiToken: string;
  baseUrl?: string;
  timeout?: number;
  enableLogging?: boolean;  // Enable HTTP logging (default: true)
  logLevel?: string;       // Log level for HTTP requests
}
```

## Environment Variables

You can control logging behavior using environment variables:

```bash
# Set global log level
LOG_LEVEL=debug

# MCP Server will use this for HTTP request logging
export LOG_LEVEL=info
```

## Log Output Examples

### HTTP Request Logging

**Request Start:**
```json
{
  "timestamp": "2024-01-01 12:00:00",
  "level": "info",
  "message": "HTTP Request Started",
  "service": "fiken-api",
  "http": {
    "method": "GET",
    "url": "https://api.fiken.no/api/v2/companies/demo/purchases",
    "requestId": "req_1234567890_abc123",
    "requestHeaders": {
      "Authorization": "Bearer 9642703995.2Zy2nT8nqbNYdldPbXDkW1PVSWttPTrq",
      "User-Agent": "fiken-shared-service/1.0.0",
      "Content-Type": "application/json",
      "X-Request-ID": "req_1234567890_abc123"
    },
    "requestBody": null
  }
}
```

**Successful Response:**
```json
{
  "timestamp": "2024-01-01 12:00:01",
  "level": "info",
  "message": "HTTP Request Completed",
  "service": "fiken-api",
  "http": {
    "method": "GET",
    "url": "https://api.fiken.no/api/v2/companies/demo/purchases",
    "requestId": "req_1234567890_abc123",
    "requestHeaders": {
      "Authorization": "Bearer 9642703995.2Zy2nT8nqbNYdldPbXDkW1PVSWttPTrq",
      "User-Agent": "fiken-shared-service/1.0.0",
      "Content-Type": "application/json",
      "X-Request-ID": "req_1234567890_abc123"
    },
    "requestBody": null,
    "responseStatus": 200,
    "responseData": {
      "purchases": [...],
      "pagination": {...}
    },
    "duration": 245
  }
}
```

**Error Response:**
```json
{
  "timestamp": "2024-01-01 12:00:01",
  "level": "error",
  "message": "HTTP Request Failed",
  "service": "fiken-api",
  "http": {
    "method": "POST",
    "url": "https://api.fiken.no/api/v2/companies/demo/purchases",
    "requestId": "req_1234567890_xyz789",
    "requestHeaders": {
      "Authorization": "Bearer 9642703995.2Zy2nT8nqbNYdldPbXDkW1PVSWttPTrq",
      "User-Agent": "fiken-shared-service/1.0.0",
      "Content-Type": "application/json",
      "X-Request-ID": "req_1234567890_xyz789"
    },
    "requestBody": {
      "date": "2024-01-01",
      "kind": "supplier"
    },
    "responseStatus": 400,
    "responseData": {
      "error": "Invalid request data"
    },
    "duration": 150,
    "error": "HTTP 400: Bad Request"
  }
}
```

## Data Sanitization

The logging framework automatically sanitizes sensitive data:

### Sensitive Fields (Automatically Redacted)
- `password`
- `token`
- `secret`
- `key`
- `auth`
- `authorization`
- `apiToken`
- `apiKey`
- `accessToken`
- `refreshToken`

### HTTP Headers Sanitization
Sensitive headers are automatically sanitized:
- `Authorization`: **Bearer tokens are masked** (shows first 4 and last 4 characters, e.g., `Bearer 9642***Ttrq`)
  - Short tokens (≤8 chars) are completely masked: `Bearer [MASKED]`
  - Other auth schemes (Token, Basic, etc.) use same masking pattern
  - Unrecognizable formats are completely masked: `[MASKED_AUTH_HEADER]`
- `Cookie`, `Set-Cookie`: Completely redacted
- `X-API-Key`, `X-Auth-Token`: Completely redacted
- Any header containing `token`, `key`, `secret`, `auth` (except Authorization): Redacted

### URL Sanitization
Sensitive query parameters are automatically redacted:
```
https://api.example.com/data?token=secret123&data=value
↓
https://api.example.com/data?token=[REDACTED]&data=value
```

### Response Size Limiting
Large responses (>10KB) are truncated in logs:
```json
{
  "responseData": "[Large Response - 25000 characters]"
}
```

## File Logging

When file logging is enabled, logs are written to:

- `logs/combined.log` - All log levels
- `logs/error.log` - Error level only
- `logs/exceptions.log` - Uncaught exceptions
- `logs/rejections.log` - Unhandled promise rejections

## Integration with MCP Server

The MCP server automatically uses the logging framework:

```typescript
// MCP server logs will include HTTP requests to Fiken API
// Check the logs mentioned in your README.md:
tail -f /Users/tha022/Library/Logs/Claude/mcp-server-fikenAI.log
```

## Best Practices

1. **Use Appropriate Log Levels**:
   - `debug`: Detailed information for debugging
   - `info`: General information about application flow
   - `warn`: Warning messages for potential issues
   - `error`: Error conditions that need attention

2. **Include Context**:
   ```typescript
   logger.info('Processing purchase', { 
     companySlug: 'demo', 
     purchaseId: 123 
   });
   ```

3. **Use Child Loggers for Context**:
   ```typescript
   const requestLogger = logger.child({ requestId: 'req_123' });
   requestLogger.info('Processing request');
   requestLogger.error('Request failed');
   ```

4. **Don't Log Sensitive Data**:
   The framework handles this automatically, but be mindful of custom logging.

## Troubleshooting

### No Logs Appearing
- Check if `enableLogging` is set to `true`
- Verify the log level allows your messages
- Ensure console output is enabled

### Performance Impact
- Use appropriate log levels in production
- Consider disabling debug logging in production
- File logging has minimal performance impact

### Log File Permissions
- Ensure the application has write permissions to the log directory
- Default log directory is `./logs` relative to the working directory

## Examples

See `examples/logging-example.ts` for a complete demonstration of all logging features.

## Dependencies

- **winston**: ^3.11.0 - Core logging framework
- Built-in TypeScript support (no additional @types package needed)
