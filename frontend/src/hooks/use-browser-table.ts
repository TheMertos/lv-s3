
import type { BrowseResult } from '@/api/admin';
import type { SortBy, SortDir } from '@/hooks/browser-types';

import { useMemo, useState, useCallback } from 'react';

const PAGE_SIZE = 50;

/**
 * Table view state: search, sort, pagination, and row selection for object listings.
 */
export function useBrowserTable(browse: BrowseResult | null) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const visibleObjects = useMemo(
    () =>
      [...(browse?.objects || [])]
        .filter((o) => o.key.toLowerCase().includes(search.trim().toLowerCase()))
        .sort((a, b) => {
          const dir = sortDir === 'asc' ? 1 : -1;
          if (sortBy === 'name') return a.key.localeCompare(b.key) * dir;
          if (sortBy === 'size') return (a.size - b.size) * dir;
          return (new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime()) * dir;
        }),
    [browse?.objects, search, sortBy, sortDir],
  );

  const pageCount = Math.max(1, Math.ceil(visibleObjects.length / PAGE_SIZE));
  const pageItems = visibleObjects.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const sortValue = `${sortBy}:${sortDir}`;
  const setSortValue = useCallback((v: string) => {
    const [s, d] = v.split(':') as [SortBy, SortDir];
    setSortBy(s);
    setSortDir(d);
  }, []);

  const headerChecked: boolean | 'indeterminate' =
    pageItems.length > 0 && pageItems.every((o) => selectedKeys.includes(o.key))
      ? true
      : pageItems.some((o) => selectedKeys.includes(o.key))
        ? 'indeterminate'
        : false;

  /** Resets pagination and selection after bucket or prefix navigation. */
  const resetView = useCallback(() => {
    setPage(1);
    setSelectedKeys([]);
  }, []);

  return {
    search,
    setSearch,
    sortValue,
    setSortValue,
    page,
    setPage,
    selectedKeys,
    setSelectedKeys,
    pageItems,
    pageCount,
    headerChecked,
    resetView,
  };
}
