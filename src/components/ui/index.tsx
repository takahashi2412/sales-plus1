import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

// 1. ボタン（Button）
export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const variantClass =
    variant === 'primary'
      ? 'primary-button'
      : variant === 'secondary'
        ? 'secondary-button'
        : 'ghost-button';
  return (
    <button type={type} className={`${variantClass} ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}

// 2. 入力欄（Input / Textarea）
export interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export function InputField({ label, hint, id, className = '', ...rest }: InputFieldProps) {
  return (
    <div className={`form-field ${className}`.trim()}>
      {label && (
        <label className="form-label" htmlFor={id}>
          {label}
          {hint && <small className="form-hint">{hint}</small>}
        </label>
      )}
      <input id={id} className="text-input" {...rest} />
    </div>
  );
}

export interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
}

export function TextareaField({
  label,
  hint,
  id,
  className = '',
  rows = 3,
  ...rest
}: TextareaFieldProps) {
  return (
    <div className={`form-field ${className}`.trim()}>
      {label && (
        <label className="form-label" htmlFor={id}>
          {label}
          {hint && <small className="form-hint">{hint}</small>}
        </label>
      )}
      <textarea id={id} rows={rows} className="textarea-input" {...rest} />
    </div>
  );
}

// 3. 選ぶ欄（Select）
export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
}

export function SelectField({
  label,
  hint,
  id,
  options,
  placeholder,
  className = '',
  ...rest
}: SelectFieldProps) {
  return (
    <div className={`form-field ${className}`.trim()}>
      {label && (
        <label className="form-label" htmlFor={id}>
          {label}
          {hint && <small className="form-hint">{hint}</small>}
        </label>
      )}
      <select id={id} className="select-input" {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// 4. 表（DataTable）
export interface TableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = '該当する記録はありません。',
}: DataTableProps<T>) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="table-empty-cell">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((col) => (
                  <td key={col.key} className={col.className}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// 5. タグ（Tag）
export type TagTone = 'navy' | 'good' | 'warn' | 'plain' | 'brand';

export interface TagProps {
  tone?: TagTone;
  children: ReactNode;
  className?: string;
}

export function Tag({ tone = 'navy', children, className = '' }: TagProps) {
  return <span className={`ui-tag ui-tag--${tone} ${className}`.trim()}>{children}</span>;
}

// 6. 知らせの枠（NoticeBox）
export type NoticeTone = 'info' | 'good' | 'warn' | 'alert';

export interface NoticeBoxProps {
  title?: string;
  tone?: NoticeTone;
  children: ReactNode;
  role?: 'status' | 'alert';
}

export function NoticeBox({ title, tone = 'info', children, role }: NoticeBoxProps) {
  return (
    <div className={`notice-box notice-box--${tone}`} role={role}>
      {title && <div className="notice-title">{title}</div>}
      <div className="notice-body">{children}</div>
    </div>
  );
}

// 7. 日付の表示（formatDateJst / DateText）
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

export function formatDateDisplay(
  value: string | null | undefined,
  withWeekday = false,
): string {
  if (!value) return '－';
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  const [, yearStr, monthStr, dayStr] = match;
  const base = `${yearStr}/${monthStr}/${dayStr}`;
  if (!withWeekday) return base;
  const d = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr)));
  if (Number.isNaN(d.getTime())) return base;
  return `${base}（${WEEKDAYS_JA[d.getUTCDay()]}）`;
}

export interface DateTextProps {
  value: string | null | undefined;
  withWeekday?: boolean;
}

export function DateText({ value, withWeekday = false }: DateTextProps) {
  return <span className="date-text">{formatDateDisplay(value, withWeekday)}</span>;
}
