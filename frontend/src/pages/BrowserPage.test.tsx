import { BrowserPage } from '@/pages/BrowserPage';
import { withI18n } from '@/test/i18n-wrapper';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-router-dom', () => ({
  NavLink: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  MemoryRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/hooks/use-object-browser', () => ({
  useObjectBrowser: () => ({
    hasBuckets: true,
    dragActive: false,
    setDragActive: vi.fn(),
    handlePageDrop: vi.fn(),
    msg: '',
    err: '',
    bucketPublic: false,
    buckets: [{ name: 'demo', publicRead: false, encryptAtRest: false }],
    fileBucket: 'demo',
    setFileBucket: vi.fn(),
    prefix: '',
    setPrefix: vi.fn(),
    browse: { prefixes: [], objects: [], isTruncated: false },
    busy: false,
    search: '',
    setSearch: vi.fn(),
    sortValue: 'name:asc',
    setSortValue: vi.fn(),
    refreshList: vi.fn(),
    createBucketOpen: false,
    setCreateBucketOpen: vi.fn(),
    newFolderModalOpen: false,
    setNewFolderModalOpen: vi.fn(),
    newFolderName: '',
    setNewFolderName: vi.fn(),
    deleteKey: null,
    setDeleteKey: vi.fn(),
    deleteConfirmValue: '',
    setDeleteConfirmValue: vi.fn(),
    deleteFolderPath: null,
    setDeleteFolderPath: vi.fn(),
    page: 1,
    setPage: vi.fn(),
    selectedKeys: [],
    setSelectedKeys: vi.fn(),
    pageItems: [],
    pageCount: 1,
    uploadFilesToPrefix: vi.fn(),
    createFolderSubmit: vi.fn(),
    headerChecked: false,
    downloadObject: vi.fn(),
    copyPublicUrl: vi.fn(),
    deleteSelected: vi.fn(),
    confirmDeleteObject: vi.fn(),
    confirmDeleteFolder: vi.fn(),
    fileInputRef: { current: null },
    dragTargetPrefix: null,
    setDragTargetPrefix: vi.fn(),
    loadMore: vi.fn(),
    loadingMore: false,
    token: 'test-token',
    loadBuckets: vi.fn(),
    bucketsLoading: false,
    bucketsError: '',
  }),
}));

describe('BrowserPage', () => {
  it('renders object browser header', () => {
    render(withI18n(<BrowserPage />));
    expect(screen.getByTestId('browser-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Object Browser' })).toBeInTheDocument();
  });
});
