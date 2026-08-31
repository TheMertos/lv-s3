import { Skeleton, Table } from '@mantine/core';

type TableSkeletonProps = {
  columns: number;
  rows?: number;
};

/**
 * Placeholder table rows while list data is loading.
 */
export function TableSkeleton({ columns, rows = 4 }: TableSkeletonProps) {
  return (
    <Table withTableBorder>
      <Table.Thead>
        <Table.Tr>
          {Array.from({ length: columns }, (_, i) => (
            <Table.Th key={i}>
              <Skeleton height={16} width="60%" />
            </Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {Array.from({ length: rows }, (_, row) => (
          <Table.Tr key={row}>
            {Array.from({ length: columns }, (_, col) => (
              <Table.Td key={col}>
                <Skeleton height={16} />
              </Table.Td>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
