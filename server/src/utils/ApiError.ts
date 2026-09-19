export interface ApiErrorDetail {
  field?: string;
  message: string;
}

/** Operational error with an HTTP status and machine-readable details. */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly errors: ApiErrorDetail[];
  readonly isOperational = true;

  constructor(statusCode: number, message: string, errors: ApiErrorDetail[] = []) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.errors = errors;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = "Bad request", errors: ApiErrorDetail[] = []) {
    return new ApiError(400, message, errors);
  }
  static unauthorized(message = "Authentication required") {
    return new ApiError(401, message);
  }
  static forbidden(message = "You do not have permission to perform this action") {
    return new ApiError(403, message);
  }
  static notFound(message = "Resource not found") {
    return new ApiError(404, message);
  }
  static conflict(message = "Resource already exists", errors: ApiErrorDetail[] = []) {
    return new ApiError(409, message, errors);
  }
  static internal(message = "Something went wrong") {
    return new ApiError(500, message);
  }
}
