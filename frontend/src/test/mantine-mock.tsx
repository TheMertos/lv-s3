import type {
  ButtonHTMLAttributes,
  ElementType,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

/**
 * Lightweight Mantine stand-ins for Vitest (avoids PnP peer-resolution under Yarn Berry).
 */
export const MantineProvider = ({ children }: { children?: ReactNode }) => <>{children}</>;

export const Stack = ({ children, ...rest }: { children?: ReactNode; [key: string]: unknown }) => (
  <div {...rest}>{children}</div>
);

export const Group = ({ children, ...rest }: { children?: ReactNode; [key: string]: unknown }) => (
  <div {...rest}>{children}</div>
);

export const Box = ({ children, ...rest }: { children?: ReactNode; [key: string]: unknown }) => (
  <div {...rest}>{children}</div>
);

export const Card = ({ children, ...rest }: { children?: ReactNode; [key: string]: unknown }) => (
  <div {...rest}>{children}</div>
);

export const Text = ({ children, ...rest }: { children?: ReactNode; [key: string]: unknown }) => (
  <span {...rest}>{children}</span>
);

export const Title = ({ children, order, ...rest }: { children?: ReactNode; order?: number; [key: string]: unknown }) => {
  const Tag = order === 3 ? 'h3' : 'h2';
  return <Tag {...rest}>{children}</Tag>;
};

export const TextInput = ({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) => (
  <label>
    {label}
    <input {...props} />
  </label>
);

export const PasswordInput = TextInput;

export const Textarea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />;

export const NumberInput = ({
  label,
  value,
  onChange,
  ...props
}: {
  label?: string;
  value?: number | string;
  onChange?: (value: number | string) => void;
  [key: string]: unknown;
}) => (
  <label>
    {label}
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value === '' ? '' : Number(e.target.value))}
      {...props}
    />
  </label>
);

export const Select = ({
  label,
  data,
  value,
  onChange,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  data?: { value: string; label: string }[];
  value?: string | null;
  onChange?: (value: string | null) => void;
}) => (
  <label>
    {label}
    <select
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value || null)}
      {...props}
    >
      {(data ?? []).map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  </label>
);

export const Button = ({
  children,
  loading,
  component: Component = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  component?: ElementType;
}) => (
  <Component type="button" disabled={loading || props.disabled} {...props}>
    {children}
  </Component>
);

export const Alert = ({
  children,
  title,
  ...rest
}: {
  children?: ReactNode;
  title?: string;
  [key: string]: unknown;
}) => (
  <div role="alert" {...rest}>
    {title ? <strong>{title}</strong> : null}
    {children}
  </div>
);

export const Modal = ({
  opened,
  children,
  title,
  onClose,
}: {
  opened?: boolean;
  children?: ReactNode;
  title?: string;
  onClose?: () => void;
}) =>
  opened ? (
    <div role="dialog" aria-label={title}>
      <button type="button" onClick={onClose}>
        close
      </button>
      {children}
    </div>
  ) : null;

export const Table = ({ children }: { children?: ReactNode }) => <table>{children}</table>;
Table.Thead = ({ children }: { children?: ReactNode }) => <thead>{children}</thead>;
Table.Tbody = ({ children }: { children?: ReactNode }) => <tbody>{children}</tbody>;
Table.Tr = ({ children, ...rest }: { children?: ReactNode; [key: string]: unknown }) => (
  <tr {...rest}>{children}</tr>
);
Table.Th = ({ children, ...rest }: { children?: ReactNode; [key: string]: unknown }) => (
  <th {...rest}>{children}</th>
);
Table.Td = ({ children, ...rest }: { children?: ReactNode; [key: string]: unknown }) => (
  <td {...rest}>{children}</td>
);

export const Checkbox = ({
  checked,
  indeterminate,
  onChange,
  ...props
}: {
  checked?: boolean;
  indeterminate?: boolean;
  onChange?: (event: { currentTarget: { checked: boolean } }) => void;
  [key: string]: unknown;
}) => (
  <input
    type="checkbox"
    checked={checked}
    ref={(el) => {
      if (el) el.indeterminate = Boolean(indeterminate);
    }}
    onChange={(e) => onChange?.({ currentTarget: { checked: e.target.checked } })}
    {...props}
  />
);

export const Switch = ({
  label,
  checked,
  onChange,
  ...props
}: {
  label?: string;
  checked?: boolean;
  onChange?: (event: { currentTarget: { checked: boolean } }) => void;
  [key: string]: unknown;
}) => (
  <label>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange?.({ currentTarget: { checked: e.target.checked } })}
      {...props}
    />
    {label}
  </label>
);

export const Badge = ({
  children,
  rightSection,
}: {
  children?: ReactNode;
  rightSection?: ReactNode;
}) => (
  <span>
    {children}
    {rightSection}
  </span>
);

export const ActionIcon = ({
  children,
  'aria-label': ariaLabel,
  onClick,
  disabled,
}: {
  children?: ReactNode;
  'aria-label'?: string;
  onClick?: () => void;
  disabled?: boolean;
  [key: string]: unknown;
}) => (
  <button type="button" aria-label={ariaLabel} onClick={onClick} disabled={disabled}>
    {children}
  </button>
);

export const Skeleton = () => <span data-testid="skeleton" />;
export const Loader = () => <span data-testid="loader">Loading</span>;
export const Pagination = ({
  value,
  onChange,
  total,
}: {
  value?: number;
  onChange?: (page: number) => void;
  total?: number;
}) => (
  <div>
    {Array.from({ length: total ?? 1 }, (_, i) => (
      <button key={i + 1} type="button" onClick={() => onChange?.(i + 1)}>
        {i + 1}
      </button>
    ))}
    <span data-testid="pagination-value">{value}</span>
  </div>
);

export const AppShell = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
AppShell.Navbar = ({ children }: { children?: ReactNode }) => <nav>{children}</nav>;
AppShell.Section = ({ children }: { children?: ReactNode }) => <section>{children}</section>;
AppShell.Main = ({ children }: { children?: ReactNode }) => <main>{children}</main>;

export const NavLink = ({
  label,
  onClick,
}: {
  label?: string;
  onClick?: () => void;
}) => (
  <button type="button" onClick={onClick}>
    {label}
  </button>
);

export const ScrollArea = ({ children }: { children?: ReactNode }) => <div>{children}</div>;

export const Center = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
