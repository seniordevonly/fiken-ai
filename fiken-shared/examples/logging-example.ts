/**
 * Example demonstrating the logging functionality in fiken-shared
 */

import { FikenPurchaseService, logger, createLogger } from '../src/index';

async function demonstrateLogging() {
  console.log('=== Fiken Shared Logging Example ===\n');

  // Example 1: Using the default logger
  logger.info('Starting logging demonstration');
  logger.debug('This is a debug message');
  logger.warn('This is a warning message');
  logger.error('This is an error message', new Error('Sample error'));

  // Example 2: Creating a custom logger with different configuration
  const customLogger = createLogger({
    level: 'debug',
    serviceName: 'fiken-demo',
    enableConsole: true,
    enableFile: false
  });

  customLogger.info('Custom logger initialized');

  // Example 3: Using the Fiken service with logging enabled
  try {
    const service = new FikenPurchaseService({
      apiToken: 'demo-token-for-logging',
      enableLogging: true,
      logLevel: 'debug'
    });

    console.log('\n=== HTTP Request Logging Demo ===');
    console.log('The following would show HTTP request/response logging:');
    console.log('- Request URL, method, headers, and body');
    console.log('- Response status, headers, and data');
    console.log('- Request duration and any errors');
    console.log('- Sensitive data is automatically sanitized');

    // Note: This would fail with a real request due to invalid token,
    // but it demonstrates the logging setup
    console.log('\nService configured with logging enabled.');
    
  } catch (error) {
    logger.error('Service configuration failed', error);
  }

  // Example 4: Demonstrating HTTP logging structure
  logger.info('HTTP Request Started', {
    http: {
      method: 'GET',
      url: 'https://api.fiken.no/api/v2/companies/demo/purchases',
      requestId: 'req_123456789',
      requestHeaders: {
        'Authorization': 'Bearer 9642703995.2Zy2nT8nqbNYdldPbXDkW1PVSWttPTrq',
        'User-Agent': 'fiken-shared-service/1.0.0',
        'Content-Type': 'application/json'
      },
      requestBody: null
    }
  });

  logger.info('HTTP Request Completed', {
    http: {
      method: 'GET',
      url: 'https://api.fiken.no/api/v2/companies/demo/purchases',
      requestId: 'req_123456789',
      requestHeaders: {
        'Authorization': 'Bearer 9642703995.2Zy2nT8nqbNYdldPbXDkW1PVSWttPTrq',
        'User-Agent': 'fiken-shared-service/1.0.0',
        'Content-Type': 'application/json'
      },
      requestBody: null,
      responseStatus: 200,
      responseData: { purchases: [], pagination: {} },
      duration: 245
    }
  });

  // Example 5: Error logging
  logger.error('HTTP Request Failed', new Error('Network timeout'), {
    http: {
      method: 'POST',
      url: 'https://api.fiken.no/api/v2/companies/demo/purchases',
      requestId: 'req_987654321',
      requestHeaders: {
        'Authorization': 'Bearer 9642703995.2Zy2nT8nqbNYdldPbXDkW1PVSWttPTrq',
        'User-Agent': 'fiken-shared-service/1.0.0',
        'Content-Type': 'application/json'
      },
      requestBody: { date: '2024-01-01', kind: 'supplier' },
      duration: 30000,
      error: 'Request timeout after 30000ms'
    }
  });

  console.log('\n=== Logging Features ===');
  console.log('✅ Structured logging with Winston');
  console.log('✅ HTTP request/response logging');
  console.log('✅ HTTP headers logging (with sanitization)');
  console.log('✅ Automatic data sanitization');
  console.log('✅ Request ID tracking');
  console.log('✅ Duration measurement');
  console.log('✅ Error handling and logging');
  console.log('✅ Configurable log levels');
  console.log('✅ Console and file output support');
  console.log('✅ Child logger support for context');
}

// Run the demonstration
demonstrateLogging().catch(console.error);
