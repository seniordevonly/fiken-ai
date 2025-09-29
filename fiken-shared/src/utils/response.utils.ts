import { ApiResponse, PaginatedResponse } from '../types/common.types';

/**
 * Utility functions for creating standardized API responses
 */

export class ResponseUtils {
  static success<T>(data: T, message?: string): ApiResponse<T> {
    return {
      success: true,
      data,
      message,
    };
  }

  static error(error: string, message?: string): ApiResponse {
    return {
      success: false,
      error,
      message,
    };
  }

  static paginated<T>(
    data: T[],
    page: number,
    limit: number,
    total: number,
    message?: string,
  ): PaginatedResponse<T> {
    return {
      success: true,
      data,
      message,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const createSuccessResponse = ResponseUtils.success;
export const createErrorResponse = ResponseUtils.error;
export const createPaginatedResponse = ResponseUtils.paginated;
