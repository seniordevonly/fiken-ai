/**
 * Example demonstrating bearer token masking in HTTP logging
 */

import { createLogger } from '../src/utils/logger';

// Create a logger instance
const logger = createLogger({
  level: 'debug',
  serviceName: 'bearer-token-example',
  enableConsole: true,
  enableFile: false
});

// Example of how bearer tokens are now masked in HTTP logging
console.log('=== Bearer Token Masking Example ===\n');

// Simulate HTTP request logging with various authorization header formats
const testHeaders: Record<string, string>[] = [
  {
    'Authorization': 'Bearer 9642703995.2Zy2nT8nqbNYdldPbXDkW1PVSWttPTrq',
    'Content-Type': 'application/json',
    'User-Agent': 'fiken-shared-service/1.0.0'
  },
  {
    'Authorization': 'Bearer short123',
    'Content-Type': 'application/json',
    'User-Agent': 'fiken-shared-service/1.0.0'
  },
  {
    'Authorization': 'Token abc123def456ghi789jkl012mno345pqr678',
    'Content-Type': 'application/json',
    'User-Agent': 'fiken-shared-service/1.0.0'
  },
  {
    'Authorization': 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=',
    'Content-Type': 'application/json',
    'User-Agent': 'fiken-shared-service/1.0.0'
  }
];

testHeaders.forEach((headers, index) => {
  console.log(`\n--- Test Case ${index + 1} ---`);
  console.log('Original Authorization header:', headers.Authorization);
  
  // Log an HTTP request - this will automatically mask the bearer token
  logger.httpRequest({
    method: 'GET',
    url: 'https://api.fiken.no/api/v2/companies/test-company/purchases',
    requestId: `test-${index + 1}`,
    requestHeaders: headers,
    requestBody: undefined
  });
});

console.log('\n=== Key Features ===');
console.log('✅ Bearer tokens are masked showing only first 4 and last 4 characters');
console.log('✅ Short tokens (≤8 chars) are completely masked for security');
console.log('✅ Other auth schemes (Token, Basic, etc.) are also masked');
console.log('✅ Unrecognizable auth headers are completely masked');
console.log('✅ All other headers remain visible for debugging');

export {};
