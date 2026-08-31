import { resourceMatches } from './iam-arn';
import type {
  EvaluateResult,
  IamAction,
  IamStatement,
} from './iam-policy.types';

/**
 * Normalizes Action to an array.
 * @param action - Statement Action field
 * @returns Action list
 */
function asActionList(action: IamAction | IamAction[]): IamAction[] {
  return Array.isArray(action) ? action : [action];
}

/**
 * Normalizes Resource to an array.
 * @param resource - Statement Resource field
 * @returns Resource pattern list
 */
function asResourceList(resource: string | string[]): string[] {
  return Array.isArray(resource) ? resource : [resource];
}

/**
 * Returns true when the statement action covers the request action.
 * Exact match or statement `s3:*`.
 * @param statementAction - Statement Action value(s)
 * @param requestAction - Concrete request action (never s3:*)
 * @returns Whether actions match
 */
function actionMatches(
  statementAction: IamAction | IamAction[],
  requestAction: Exclude<IamAction, 's3:*'>,
): boolean {
  const actions = asActionList(statementAction);
  return actions.includes(requestAction) || actions.includes('s3:*');
}

/**
 * Returns true when any statement resource pattern matches the request ARN.
 * @param statementResource - Statement Resource value(s)
 * @param resourceArn - Request ARN
 * @returns Whether resources match
 */
function statementResourceMatches(
  statementResource: string | string[],
  resourceArn: string,
): boolean {
  return asResourceList(statementResource).some((pattern) =>
    resourceMatches(pattern, resourceArn),
  );
}

/**
 * Returns true when a statement matches the request (action + resource).
 * @param statement - Policy statement
 * @param action - Concrete request action
 * @param resourceArn - Request ARN
 * @returns Whether the statement applies
 */
function statementMatches(
  statement: IamStatement,
  action: Exclude<IamAction, 's3:*'>,
  resourceArn: string,
): boolean {
  return (
    actionMatches(statement.Action, action) &&
    statementResourceMatches(statement.Resource, resourceArn)
  );
}

/**
 * Evaluates flattened IAM statements only (no allowedBuckets).
 * Explicit Deny wins; else Allow if any matching Allow; else defaultDeny.
 * @param statements - Flattened statements from all attached policies
 * @param action - Request action (never s3:* — concrete action)
 * @param resourceArn - Request ARN from buildIamArn
 * @returns Evaluation outcome
 */
export function evaluateIamStatements(
  statements: IamStatement[],
  action: Exclude<IamAction, 's3:*'>,
  resourceArn: string,
): EvaluateResult {
  const matching = statements.filter((s) =>
    statementMatches(s, action, resourceArn),
  );

  if (matching.some((s) => s.Effect === 'Deny')) {
    return 'explicitDeny';
  }
  if (matching.some((s) => s.Effect === 'Allow')) {
    return 'allow';
  }
  return 'defaultDeny';
}
