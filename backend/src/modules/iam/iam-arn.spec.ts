import { buildIamArn, resourceMatches } from './iam-arn';

describe('buildIamArn', () => {
  it('builds a bucket-only ARN when key is omitted', () => {
    expect(buildIamArn('photos')).toBe('arn:lv-s3:::photos');
  });

  it('builds an object ARN when key is provided', () => {
    expect(buildIamArn('photos', '2024/img.jpg')).toBe(
      'arn:lv-s3:::photos/2024/img.jpg',
    );
  });
});

describe('resourceMatches', () => {
  it('matches exact bucket ARN', () => {
    expect(resourceMatches('arn:lv-s3:::photos', 'arn:lv-s3:::photos')).toBe(
      true,
    );
  });

  it('does not match bucket-only pattern against object ARN', () => {
    expect(
      resourceMatches('arn:lv-s3:::photos', 'arn:lv-s3:::photos/img.jpg'),
    ).toBe(false);
  });

  it('matches exact object ARN', () => {
    expect(
      resourceMatches(
        'arn:lv-s3:::photos/img.jpg',
        'arn:lv-s3:::photos/img.jpg',
      ),
    ).toBe(true);
  });

  it('matches trailing wildcard prefix on object key', () => {
    expect(resourceMatches('arn:lv-s3:::b/foo*', 'arn:lv-s3:::b/foobar')).toBe(
      true,
    );
    expect(
      resourceMatches('arn:lv-s3:::photos/*', 'arn:lv-s3:::photos/a/b'),
    ).toBe(true);
  });

  it('does not match when prefix does not align', () => {
    expect(resourceMatches('arn:lv-s3:::b/foo*', 'arn:lv-s3:::b/bar')).toBe(
      false,
    );
    expect(resourceMatches('arn:lv-s3:::other/*', 'arn:lv-s3:::photos/x')).toBe(
      false,
    );
  });
});
