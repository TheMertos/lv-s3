import { Box, Group, Stack, Text } from '@mantine/core';

const MARK_PX = { sm: 40, lg: 72 } as const;

type LogoSize = keyof typeof MARK_PX;

/**
 * Product mark for the LV S3 admin console.
 * @param size - Compact sidebar mark (`sm`) or login mark (`lg`)
 */
export function Logo({ size = 'sm' }: { size?: LogoSize } = {}) {
  const px = MARK_PX[size];
  return (
    <Group gap="sm" wrap="nowrap">
      <Box
        w={px}
        h={px}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          borderRadius: 'var(--mantine-radius-md)',
          background: '#000000',
          border: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <img
          src="/lv-s3-logo.png"
          alt="LV S3"
          width={px}
          height={px}
          style={{ objectFit: 'cover', display: 'block' }}
        />
      </Box>
      <Stack gap={0}>
        <Text fw={600} size="lg" lh={1.2}>
          LV S3
        </Text>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.2em' }}>
          Console
        </Text>
      </Stack>
    </Group>
  );
}
