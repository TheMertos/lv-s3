import { buildIamArn } from './iam-arn';
import { evaluateIamStatements } from './iam-policy-evaluator';
import type { IamStatement } from './iam-policy.types';

describe('evaluateIamStatements', () => {
  const objectArn = buildIamArn('photos', 'img.jpg');
  const bucketArn = buildIamArn('photos');

  it('returns defaultDeny when statements are empty', () => {
    expect(evaluateIamStatements([], 's3:GetObject', objectArn)).toBe(
      'defaultDeny',
    );
  });

  it('allows GetObject when s3:* Allow matches the resource', () => {
    const statements: IamStatement[] = [
      {
        Effect: 'Allow',
        Action: 's3:*',
        Resource: 'arn:lv-s3:::photos/*',
      },
    ];
    expect(evaluateIamStatements(statements, 's3:GetObject', objectArn)).toBe(
      'allow',
    );
  });

  it('explicit Deny beats Allow on the same request', () => {
    const statements: IamStatement[] = [
      {
        Effect: 'Allow',
        Action: 's3:GetObject',
        Resource: 'arn:lv-s3:::photos/*',
      },
      {
        Effect: 'Deny',
        Action: 's3:GetObject',
        Resource: 'arn:lv-s3:::photos/img.jpg',
      },
    ];
    expect(evaluateIamStatements(statements, 's3:GetObject', objectArn)).toBe(
      'explicitDeny',
    );
  });

  it('returns defaultDeny when action does not match', () => {
    const statements: IamStatement[] = [
      {
        Effect: 'Allow',
        Action: 's3:GetObject',
        Resource: 'arn:lv-s3:::photos/*',
      },
    ];
    expect(evaluateIamStatements(statements, 's3:PutObject', objectArn)).toBe(
      'defaultDeny',
    );
  });

  it('matches ListBucket against bucket-only ARN', () => {
    const statements: IamStatement[] = [
      {
        Effect: 'Allow',
        Action: 's3:ListBucket',
        Resource: 'arn:lv-s3:::photos',
      },
    ];
    expect(evaluateIamStatements(statements, 's3:ListBucket', bucketArn)).toBe(
      'allow',
    );
  });

  it('does not allow object action via bucket-only resource', () => {
    const statements: IamStatement[] = [
      {
        Effect: 'Allow',
        Action: 's3:GetObject',
        Resource: 'arn:lv-s3:::photos',
      },
    ];
    expect(evaluateIamStatements(statements, 's3:GetObject', objectArn)).toBe(
      'defaultDeny',
    );
  });
});
