import { Group, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

/**
 * Standard page title block for management views.
 */
export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <Group justify="space-between" align="flex-start" wrap="wrap" mb="lg" gap="md">
      <Stack gap={4} maw={720}>
        <Title order={2}>{title}</Title>
        {subtitle ? (
          <Text size="sm" c="dimmed">
            {subtitle}
          </Text>
        ) : null}
      </Stack>
      {right ? <div>{right}</div> : null}
    </Group>
  );
}
