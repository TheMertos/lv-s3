import { BadRequestException } from '@nestjs/common';

import { parseAndValidatePolicyDocument } from './iam-policy-document';

describe('parseAndValidatePolicyDocument', () => {
  const validDoc = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: 's3:GetObject',
        Resource: 'arn:lv-s3:::photos/*',
      },
    ],
  };

  it('returns a validated document for a well-formed policy', () => {
    const result = parseAndValidatePolicyDocument(validDoc);
    expect(result.Version).toBe('2012-10-17');
    expect(result.Statement).toHaveLength(1);
    expect(result.Statement[0].Effect).toBe('Allow');
  });

  it('accepts Action and Resource as arrays', () => {
    const result = parseAndValidatePolicyDocument({
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'read',
          Effect: 'Allow',
          Action: ['s3:GetObject', 's3:ListBucket'],
          Resource: ['arn:lv-s3:::photos', 'arn:lv-s3:::photos/*'],
        },
      ],
    });
    expect(result.Statement[0].Sid).toBe('read');
    expect(result.Statement[0].Action).toEqual([
      's3:GetObject',
      's3:ListBucket',
    ]);
  });

  it('rejects unknown action', () => {
    expect(() =>
      parseAndValidatePolicyDocument({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: 's3:CreateBucket',
            Resource: 'arn:lv-s3:::photos',
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects bad Version', () => {
    expect(() =>
      parseAndValidatePolicyDocument({
        Version: '2008-10-17',
        Statement: validDoc.Statement,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects empty Statement', () => {
    expect(() =>
      parseAndValidatePolicyDocument({
        Version: '2012-10-17',
        Statement: [],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects malformed resource ARN', () => {
    expect(() =>
      parseAndValidatePolicyDocument({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: 's3:*',
            Resource: 'arn:lv-s3:::bucket*',
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects invalid Effect', () => {
    expect(() =>
      parseAndValidatePolicyDocument({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Permit',
            Action: 's3:GetObject',
            Resource: 'arn:lv-s3:::photos/*',
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });
});
