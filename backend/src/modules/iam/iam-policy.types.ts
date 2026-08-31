/** Supported MVP IAM action names (including wildcard). */
export const IAM_ACTIONS = [
  's3:GetObject',
  's3:PutObject',
  's3:DeleteObject',
  's3:ListBucket',
  's3:*',
] as const;

/** One supported IAM action string. */
export type IamAction = (typeof IAM_ACTIONS)[number];

/** Statement effect: Allow or Deny. */
export type IamEffect = 'Allow' | 'Deny';

/** Single IAM policy statement (MVP subset). */
export type IamStatement = {
  Sid?: string;
  Effect: IamEffect;
  Action: IamAction | IamAction[];
  Resource: string | string[];
};

/** Validated IAM policy document (AWS Version string, MVP statements). */
export type IamPolicyDocument = {
  Version: '2012-10-17';
  Statement: IamStatement[];
};

/** Result of evaluating statements against a concrete request. */
export type EvaluateResult = 'explicitDeny' | 'allow' | 'defaultDeny';
