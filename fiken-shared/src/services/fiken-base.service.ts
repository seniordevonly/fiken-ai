/**
 * Base Fiken service with HTTP client and configuration
 */

import { ApiResponse } from '../types/common.types';
import { FikenApiResponse, FikenPaginationHeaders } from '../types/fiken.types';
import { logger, LoggerService, createLogger } from '../utils/logger';

export interface FikenConfig {
  apiToken: string;
  baseUrl?: string;
  timeout?: number;
  enableLogging?: boolean;
  logLevel?: string;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
}

export class FikenBaseService {
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly timeout: number;
  protected readonly logger: LoggerService;

  constructor(config: FikenConfig) {
    // Ensure base URL always ends with /api/v2
    let baseUrl = config.baseUrl || 'https://api.fiken.no/api/v2';
    if (baseUrl === 'https://api.fiken.no' || baseUrl.endsWith('/api/fiken.no')) {
      baseUrl = 'https://api.fiken.no/api/v2';
    } else if (!baseUrl.endsWith('/api/v2')) {
      baseUrl = baseUrl.replace(/\/$/, '') + '/api/v2';
    }
    this.baseUrl = baseUrl;
    this.apiToken = config.apiToken;
    this.timeout = config.timeout || 30000;
    
    // Initialize logger
    if (config.enableLogging !== false) {
      this.logger = createLogger({
        level: config.logLevel || 'info',
        serviceName: 'fiken-api',
        enableConsole: false, // Disable console to avoid MCP STDIO interference
        enableFile: true // Use file logging by default
      });
    } else {
      // Create a no-op logger if logging is disabled
      this.logger = createLogger({ level: 'silent' });
    }
    
    // Log the configured base URL for debugging
    this.logger.info('Fiken service initialized', {
      baseUrl: this.baseUrl,
      configuredBaseUrl: config.baseUrl,
      timeout: this.timeout
    });
  }

  /**
   * Make HTTP GET request
   */
  protected async get<T>(
    endpoint: string,
    params?: Record<string, any>,
    options?: RequestOptions
  ): Promise<FikenApiResponse<T>> {
    const url = this.buildUrl(endpoint, params);
    const response = await this.makeRequest('GET', url, undefined, options);
    return this.handleResponse<T>(response);
  }

  /**
   * Make HTTP POST request
   */
  protected async post<T>(
    endpoint: string,
    data?: any,
    options?: RequestOptions
  ): Promise<FikenApiResponse<T>> {
    const url = this.buildUrl(endpoint);
    const response = await this.makeRequest('POST', url, data, options);
    return this.handleResponse<T>(response);
  }

  /**
   * Make HTTP PUT request
   */
  protected async put<T>(
    endpoint: string,
    data?: any,
    options?: RequestOptions
  ): Promise<FikenApiResponse<T>> {
    const url = this.buildUrl(endpoint);
    const response = await this.makeRequest('PUT', url, data, options);
    return this.handleResponse<T>(response);
  }

  /**
   * Make HTTP PATCH request
   */
  protected async patch<T>(
    endpoint: string,
    data?: any,
    options?: RequestOptions
  ): Promise<FikenApiResponse<T>> {
    const url = this.buildUrl(endpoint);
    const response = await this.makeRequest('PATCH', url, data, options);
    return this.handleResponse<T>(response);
  }

  /**
   * Make HTTP DELETE request
   */
  protected async delete<T>(
    endpoint: string,
    options?: RequestOptions
  ): Promise<FikenApiResponse<T>> {
    const url = this.buildUrl(endpoint);
    const response = await this.makeRequest('DELETE', url, undefined, options);
    return this.handleResponse<T>(response);
  }

  /**
   * Upload multipart form data (for attachments)
   */
  protected async uploadMultipart<T>(
    endpoint: string,
    formData: FormData,
    options?: RequestOptions
  ): Promise<FikenApiResponse<T>> {
    const url = this.buildUrl(endpoint);
    const response = await this.makeRequest('POST', url, formData, {
      ...options,
      headers: {
        ...options?.headers,
        // Don't set Content-Type for FormData, let the browser set it with boundary
      }
    });
    return this.handleResponse<T>(response);
  }

  /**
   * Build full URL with query parameters
   */
  private buildUrl(endpoint: string, params?: Record<string, any>): string {
    // Properly join base URL and endpoint to avoid path replacement
    const baseUrl = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    const fullUrl = `${baseUrl}/${cleanEndpoint}`;
    
    const url = new URL(fullUrl);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }
    
    return url.toString();
  }

  /**
   * Make HTTP request using fetch API
   */
  private async makeRequest(
    method: string,
    url: string,
    data?: any,
    options?: RequestOptions
  ): Promise<Response> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiToken}`,
      'User-Agent': 'fiken-shared-service/1.0.0',
      'X-Request-ID': requestId,
      ...options?.headers
    };

    // Only set Content-Type for JSON data
    if (data && !(data instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const requestOptions: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(options?.timeout || this.timeout)
    };

    if (data) {
      if (data instanceof FormData) {
        requestOptions.body = data;
      } else {
        requestOptions.body = JSON.stringify(data);
      }
    }

    // Log request start
    this.logger.httpRequest({
      method,
      url,
      requestId,
      requestHeaders: headers,
      requestBody: data
    });

    try {
      const response = await fetch(url, requestOptions);
      const duration = Date.now() - startTime;
      
      if (!response.ok) {
        // Log error response
        let responseData: any;
        try {
          const responseText = await response.text();
          responseData = responseText ? JSON.parse(responseText) : null;
        } catch {
          responseData = '[Unable to parse response]';
        }
        
        this.logger.httpResponse({
          method,
          url,
          requestId,
          requestHeaders: headers,
          requestBody: data,
          responseStatus: response.status,
          responseData,
          duration,
          error: `HTTP ${response.status}: ${response.statusText}`
        });
        
        await this.handleErrorResponse(response);
      }
      
      // Log successful response (we'll log the actual data in handleResponse)
      this.logger.httpResponse({
        method,
        url,
        requestId,
        requestHeaders: headers,
        requestBody: data,
        responseStatus: response.status,
        duration
      });
      
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Log request failure
      this.logger.httpResponse({
        method,
        url,
        requestId,
        requestHeaders: headers,
        requestBody: data,
        duration,
        error: errorMessage
      });
      
      if (error instanceof Error) {
        throw new Error(`Fiken API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Handle successful response
   */
  private async handleResponse<T>(response: Response): Promise<FikenApiResponse<T>> {
    let data: T;
    const requestId = response.headers.get('X-Request-ID') || 'unknown';
    
    // Handle empty responses (like 204 No Content)
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      data = undefined as T;
    } else {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json() as T;
      } else {
        data = await response.text() as T;
      }
    }

    // Log response data for successful requests
    this.logger.debug('HTTP Response Data', {
      requestId,
      status: response.status,
      contentType: response.headers.get('content-type'),
      responseData: data
    });

    // Extract pagination headers if present
    const headers: FikenPaginationHeaders | undefined = this.extractPaginationHeaders(response);

    return { data, headers };
  }

  /**
   * Handle error response
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    
    try {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json() as any;
        if (errorData?.error_description) {
          errorMessage = errorData.error_description;
        } else if (errorData?.message) {
          errorMessage = errorData.message;
        } else if (errorData?.error) {
          errorMessage = errorData.error;
        }
      }
    } catch {
      // If we can't parse the error response, use the default message
    }

    throw new Error(errorMessage);
  }

  /**
   * Extract pagination headers from response
   */
  private extractPaginationHeaders(response: Response): FikenPaginationHeaders | undefined {
    const page = response.headers.get('Fiken-Api-Page');
    const pageSize = response.headers.get('Fiken-Api-Page-Size');
    const pageCount = response.headers.get('Fiken-Api-Page-Count');
    const resultCount = response.headers.get('Fiken-Api-Result-Count');

    if (page && pageSize && pageCount && resultCount) {
      return {
        'Fiken-Api-Page': parseInt(page, 10),
        'Fiken-Api-Page-Size': parseInt(pageSize, 10),
        'Fiken-Api-Page-Count': parseInt(pageCount, 10),
        'Fiken-Api-Result-Count': parseInt(resultCount, 10)
      };
    }

    return undefined;
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate company slug format
   */
  protected validateCompanySlug(companySlug: string): void {
    if (!companySlug || typeof companySlug !== 'string') {
      throw new Error('Company slug is required and must be a string');
    }
  }

  /**
   * Validate required ID parameter
   */
  protected validateId(id: number | string, paramName: string): void {
    if (!id || (typeof id !== 'number' && typeof id !== 'string')) {
      throw new Error(`${paramName} is required and must be a number or string`);
    }
  }

  /**
   * Format date to yyyy-mm-dd
   */
  protected formatDate(date: Date | string): string {
    if (typeof date === 'string') {
      return date;
    }
    return date.toISOString().split('T')[0];
  }

  /**
   * Post multipart form data (for attachments)
   */
  protected async postMultipart<T>(
    endpoint: string,
    attachment: any,
    options?: RequestOptions
  ): Promise<FikenApiResponse<T>> {
    const formData = new FormData();
    
    if (attachment.filename) {
      formData.append('filename', attachment.filename);
    }
    
    if (attachment.comment) {
      formData.append('comment', attachment.comment);
    }
    
    if (attachment.file) {
      formData.append('file', attachment.file);
    }
    
    return this.uploadMultipart<T>(endpoint, formData, options);
  }

  /**
   * Validate date format (yyyy-mm-dd)
   */
  protected isValidDate(dateString: string): boolean {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateString)) {
      return false;
    }
    
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime()) && 
           date.toISOString().split('T')[0] === dateString;
  }

  /**
   * Validate attachment
   */
  protected validateAttachment(attachment: any): void {
    if (!attachment.filename) {
      throw new Error('Attachment filename is required');
    }
    
    const validExtensions = ['.png', '.jpeg', '.jpg', '.gif', '.pdf'];
    const hasValidExtension = validExtensions.some(ext => 
      attachment.filename.toLowerCase().endsWith(ext)
    );
    
    if (!hasValidExtension) {
      throw new Error(`Invalid file extension. Must be one of: ${validExtensions.join(', ')}`);
    }
    
    if (!attachment.file) {
      throw new Error('Attachment file is required');
    }
  }
}
