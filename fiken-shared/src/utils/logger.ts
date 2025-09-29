/**
 * Logger configuration and utilities using Winston
 */

import winston from 'winston';

export interface LoggerConfig {
  level?: string;
  enableConsole?: boolean;
  enableFile?: boolean;
  logDir?: string;
  serviceName?: string;
}

export interface HttpLogData {
  method: string;
  url: string;
  requestId: string;
  requestHeaders?: Record<string, string>;
  requestBody?: any;
  responseStatus?: number;
  responseData?: any;
  duration?: number;
  error?: string;
}

class LoggerService {
  private logger: winston.Logger;
  private config: LoggerConfig;

  constructor(config: LoggerConfig = {}) {
    this.config = {
      level: config.level || process.env.LOG_LEVEL || 'info',
      enableConsole: config.enableConsole !== false,
      enableFile: config.enableFile || false,
      logDir: config.logDir || './logs',
      serviceName: config.serviceName || 'fiken-shared',
      ...config
    };

    this.logger = this.createLogger();
  }

  private createLogger(): winston.Logger {
    const transports: winston.transport[] = [];

    // Console transport with colored output (using stderr to avoid MCP protocol interference)
    if (this.config.enableConsole) {
      transports.push(
        new winston.transports.Console({
          stderrLevels: ['error', 'warn', 'info', 'debug'], // Force all levels to stderr
          format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.errors({ stack: true }),
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, service, ...meta }: any) => {
              const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
              return `${timestamp} [${service || this.config.serviceName}] ${level}: ${message} ${metaStr}`;
            })
          )
        })
      );
    }

    // File transport for persistent logging
    if (this.config.enableFile) {
      transports.push(
        new winston.transports.File({
          filename: `${this.config.logDir}/error.log`,
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          )
        }),
        new winston.transports.File({
          filename: `${this.config.logDir}/combined.log`,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          )
        })
      );
    }

    return winston.createLogger({
      level: this.config.level,
      defaultMeta: { service: this.config.serviceName },
      transports,
      // Handle uncaught exceptions and rejections
      exceptionHandlers: this.config.enableFile ? [
        new winston.transports.File({ filename: `${this.config.logDir}/exceptions.log` })
      ] : [],
      rejectionHandlers: this.config.enableFile ? [
        new winston.transports.File({ filename: `${this.config.logDir}/rejections.log` })
      ] : []
    });
  }

  /**
   * Log debug message
   */
  debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  /**
   * Log info message
   */
  info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  /**
   * Log warning message
   */
  warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | any, meta?: any): void {
    if (error instanceof Error) {
      this.logger.error(message, { error: error.message, stack: error.stack, ...meta });
    } else if (error) {
      this.logger.error(message, { error, ...meta });
    } else {
      this.logger.error(message, meta);
    }
  }

  /**
   * Log HTTP request start
   */
  httpRequest(data: Omit<HttpLogData, 'responseStatus' | 'responseData' | 'duration' | 'error'>): void {
    this.info('HTTP Request Started', {
      http: {
        method: data.method,
        url: this.sanitizeUrl(data.url),
        requestId: data.requestId,
        requestHeaders: this.sanitizeHeaders(data.requestHeaders),
        requestBody: this.sanitizeRequestBody(data.requestBody)
      }
    });
  }

  /**
   * Log HTTP response
   */
  httpResponse(data: HttpLogData): void {
    const level = data.responseStatus && data.responseStatus >= 400 ? 'error' : 'info';
    const message = data.error ? 'HTTP Request Failed' : 'HTTP Request Completed';
    
    this.logger.log(level, message, {
      http: {
        method: data.method,
        url: this.sanitizeUrl(data.url),
        requestId: data.requestId,
        requestHeaders: this.sanitizeHeaders(data.requestHeaders),
        requestBody: this.sanitizeRequestBody(data.requestBody),
        responseStatus: data.responseStatus,
        responseData: this.sanitizeResponseData(data.responseData),
        duration: data.duration,
        error: data.error
      }
    });
  }

  /**
   * Create a child logger with additional context
   */
  child(meta: any): LoggerService {
    const childLogger = new LoggerService(this.config);
    childLogger.logger = this.logger.child(meta);
    return childLogger;
  }

  /**
   * Get the underlying Winston logger instance
   */
  getWinstonLogger(): winston.Logger {
    return this.logger;
  }

  /**
   * Sanitize URL to remove sensitive information
   */
  private sanitizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove sensitive query parameters
      const sensitiveParams = ['token', 'key', 'secret', 'password', 'auth'];
      sensitiveParams.forEach(param => {
        if (urlObj.searchParams.has(param)) {
          urlObj.searchParams.set(param, '[REDACTED]');
        }
      });
      return urlObj.toString();
    } catch {
      return url;
    }
  }

  /**
   * Mask bearer token in authorization header
   */
  private maskBearerToken(authHeader: string): string {
    if (!authHeader) return authHeader;
    
    // Handle Bearer token format
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch) {
      const token = bearerMatch[1];
      if (token.length <= 8) {
        // For very short tokens, mask completely
        return 'Bearer [MASKED]';
      } else {
        // Show first 4 and last 4 characters, mask the middle
        const masked = token.substring(0, 4) + '***' + token.substring(token.length - 4);
        return `Bearer ${masked}`;
      }
    }
    
    // Handle other authorization formats
    const spaceIndex = authHeader.indexOf(' ');
    if (spaceIndex > 0) {
      const scheme = authHeader.substring(0, spaceIndex);
      const token = authHeader.substring(spaceIndex + 1);
      if (token.length <= 8) {
        return `${scheme} [MASKED]`;
      } else {
        const masked = token.substring(0, 4) + '***' + token.substring(token.length - 4);
        return `${scheme} ${masked}`;
      }
    }
    
    // If no recognizable format, mask the whole thing
    return '[MASKED_AUTH_HEADER]';
  }

  /**
   * Sanitize headers to remove sensitive information
   */
  private sanitizeHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
    if (!headers) return headers;

    const sanitized: Record<string, string> = {};
    const sensitiveHeaders = [
      'auth', 'token', 'api-key', 'apikey', 'x-api-key',
      'x-auth-token', 'bearer', 'cookie', 'set-cookie'
    ];

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      
      // Mask Authorization header to hide sensitive bearer tokens
      if (lowerKey === 'authorization') {
        sanitized[key] = this.maskBearerToken(value);
      } else if (sensitiveHeaders.some(sensitive => lowerKey.includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitize request body to remove sensitive information
   */
  private sanitizeRequestBody(body: any): any {
    if (!body) return body;
    
    if (body instanceof FormData) {
      return '[FormData]';
    }

    if (typeof body === 'string') {
      try {
        const parsed = JSON.parse(body);
        return this.sanitizeObject(parsed);
      } catch {
        return '[String Data]';
      }
    }

    return this.sanitizeObject(body);
  }

  /**
   * Sanitize response data to remove sensitive information and limit size
   */
  private sanitizeResponseData(data: any): any {
    if (!data) return data;

    const sanitized = this.sanitizeObject(data);
    
    // Limit response data size in logs
    const jsonStr = JSON.stringify(sanitized);
    if (jsonStr.length > 10000) {
      return '[Large Response - ' + jsonStr.length + ' characters]';
    }
    
    return sanitized;
  }

  /**
   * Sanitize object by removing/masking sensitive fields
   */
  private sanitizeObject(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;

    const sensitiveFields = [
      'password', 'token', 'secret', 'key', 'auth', 'authorization',
      'apiToken', 'apiKey', 'accessToken', 'refreshToken'
    ];

    const sanitized = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        (sanitized as any)[key] = '[REDACTED]';
      } else if (value && typeof value === 'object') {
        (sanitized as any)[key] = this.sanitizeObject(value);
      } else {
        (sanitized as any)[key] = value;
      }
    }

    return sanitized;
  }
}

// Create default logger instance
export const logger = new LoggerService();

// Export factory function for custom loggers
export const createLogger = (config: LoggerConfig): LoggerService => {
  return new LoggerService(config);
};

// Export types
export { LoggerService };
