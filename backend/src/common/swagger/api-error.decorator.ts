import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiTooManyRequestsResponse,
  ApiInternalServerErrorResponse,
  ApiPayloadTooLargeResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../api-error-response.dto';

/**
 * Documents standard API error responses for admin endpoints.
 */
export function ApiStandardErrors(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiBadRequestResponse({ type: ApiErrorResponseDto }),
    ApiUnauthorizedResponse({ type: ApiErrorResponseDto }),
    ApiForbiddenResponse({ type: ApiErrorResponseDto }),
    ApiNotFoundResponse({ type: ApiErrorResponseDto }),
    ApiConflictResponse({ type: ApiErrorResponseDto }),
    ApiPayloadTooLargeResponse({ type: ApiErrorResponseDto }),
    ApiTooManyRequestsResponse({ type: ApiErrorResponseDto }),
    ApiInternalServerErrorResponse({ type: ApiErrorResponseDto }),
  );
}
