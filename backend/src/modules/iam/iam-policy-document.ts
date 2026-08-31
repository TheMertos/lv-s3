import { BadRequestException } from '@nestjs/common';

import {
  IAM_ACTIONS,
  type IamAction,
  type IamEffect,
  type IamPolicyDocument,
  type IamStatement,
} from './iam-policy.types';

const POLICY_VERSION = '2012-10-17';
const IAM_ACTION_SET = new Set<string>(IAM_ACTIONS);

/** Bucket-only ARN: arn:lv-s3:::{bucket} (no slash, no wildcard). */
const BUCKET_ARN_RE = /^arn:lv-s3:::([^/*]+)$/;

/**
 * Object exact or prefix ARN: arn:lv-s3:::{bucket}/{key} or .../{prefix}*
 * Trailing `*` only after a `/` (object key prefix); no mid-string wildcards.
 */
const OBJECT_ARN_RE = /^arn:lv-s3:::([^/*]+)\/(.+)$/;

/**
 * Throws BadRequestException when condition is false.
 * @param ok - Predicate result
 * @param message - Error message
 */
function assertValid(ok: boolean, message: string): asserts ok {
  if (!ok) {
    throw new BadRequestException(message);
  }
}

/**
 * Returns true when value is a supported IAM action.
 * @param value - Candidate action string
 * @returns Whether value is in IAM_ACTIONS
 */
function isIamAction(value: unknown): value is IamAction {
  return typeof value === 'string' && IAM_ACTION_SET.has(value);
}

/**
 * Validates a single resource ARN pattern for MVP.
 * @param resource - Resource string from a statement
 */
function validateResourceArn(resource: string): void {
  assertValid(
    typeof resource === 'string' && resource.length > 0,
    'Resource must be a non-empty string',
  );

  if (BUCKET_ARN_RE.test(resource)) {
    return;
  }

  const objectMatch = OBJECT_ARN_RE.exec(resource);
  assertValid(objectMatch != null, `Invalid resource ARN: ${resource}`);

  const keyPart = objectMatch[2];
  assertValid(keyPart.length > 0, `Invalid resource ARN: ${resource}`);
  // Wildcard only as trailing character of the key portion
  if (keyPart.includes('*')) {
    assertValid(
      keyPart.endsWith('*') && keyPart.indexOf('*') === keyPart.length - 1,
      `Invalid resource ARN wildcard: ${resource}`,
    );
  }
}

/**
 * Validates and normalizes Action to a non-empty IamAction array.
 * @param raw - Action field from statement
 * @returns Validated actions
 */
function validateActions(raw: unknown): IamAction | IamAction[] {
  if (Array.isArray(raw)) {
    assertValid(raw.length > 0, 'Action array must not be empty');
    for (const a of raw) {
      assertValid(isIamAction(a), `Unknown action: ${String(a)}`);
    }
    return raw as IamAction[];
  }
  assertValid(isIamAction(raw), `Unknown action: ${String(raw)}`);
  return raw;
}

/**
 * Validates Resource field (string or non-empty string array).
 * @param raw - Resource field from statement
 * @returns Validated resource(s)
 */
function validateResources(raw: unknown): string | string[] {
  if (Array.isArray(raw)) {
    assertValid(raw.length > 0, 'Resource array must not be empty');
    for (const r of raw) {
      assertValid(typeof r === 'string', 'Resource must be a string');
      validateResourceArn(r);
    }
    return raw as string[];
  }
  assertValid(typeof raw === 'string', 'Resource must be a string');
  validateResourceArn(raw);
  return raw;
}

/**
 * Validates one policy statement object.
 * @param raw - Candidate statement
 * @param index - Statement index for error messages
 * @returns Validated IamStatement
 */
function validateStatement(raw: unknown, index: number): IamStatement {
  assertValid(
    raw != null && typeof raw === 'object' && !Array.isArray(raw),
    `Statement[${index}] must be an object`,
  );
  const obj = raw as Record<string, unknown>;

  const effect = obj.Effect;
  assertValid(
    effect === 'Allow' || effect === 'Deny',
    `Statement[${index}] Effect must be Allow or Deny`,
  );

  const statement: IamStatement = {
    Effect: effect as IamEffect,
    Action: validateActions(obj.Action),
    Resource: validateResources(obj.Resource),
  };

  if (obj.Sid !== undefined) {
    assertValid(
      typeof obj.Sid === 'string',
      `Statement[${index}] Sid must be a string`,
    );
    statement.Sid = obj.Sid;
  }

  return statement;
}

/**
 * Parses and validates an IAM policy document; throws BadRequestException on failure.
 * @param raw - Unknown JSON-shaped input
 * @returns Validated IamPolicyDocument
 */
export function parseAndValidatePolicyDocument(
  raw: unknown,
): IamPolicyDocument {
  assertValid(
    raw != null && typeof raw === 'object' && !Array.isArray(raw),
    'Policy document must be an object',
  );
  const obj = raw as Record<string, unknown>;

  assertValid(
    obj.Version === POLICY_VERSION,
    `Version must be ${POLICY_VERSION}`,
  );

  assertValid(Array.isArray(obj.Statement), 'Statement must be an array');
  assertValid(obj.Statement.length > 0, 'Statement must not be empty');

  const statements = obj.Statement.map((s, i) => validateStatement(s, i));

  return {
    Version: POLICY_VERSION,
    Statement: statements,
  };
}
