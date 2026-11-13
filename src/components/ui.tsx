/**
 * Poise UI kit. Small, accessible building blocks shared by every screen.
 */
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, Search, X, XCircle, type LucideIcon } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { usePoise } from '../store/store';

export { clsx as cx };

/* ------------------------------ Button ------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'xs' | 'sm' | 'md';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-silver-400 border border-transparent',
  secondary: 'bg-white text-ink border border-line-strong hover:bg-canvas hover:border-silver-400 disabled:text-subtle',
  ghost: 'bg-transparent text-ink hover:bg-silver-100 border border-transparent disabled:text-subtle',
  subtle: 'bg-brand-50 text-brand-800 hover:bg-brand-100 border border-transparent disabled:text-subtle',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 border border-transparent disabled:bg-silver-400',
};
const SIZE: Record<ButtonSize, string> = {
  xs: 'h-7 px-2 text-xs gap-1',
  sm: 'h-8 px-2.5 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon className={size === 'xs' ? 'size-3.5' : 'size-4'} aria-hidden />}
      {children}
      {IconRight && <IconRight className={size === 'xs' ? 'size-3.5' : 'size-4'} aria-hidden />}
    </button>
  );
});

export function IconButton({ icon: Icon, label, className, ...rest }: { icon: LucideIcon; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx('inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-silver-100 hover:text-ink', className)}
      {...rest}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

/* ------------------------------ Badge ------------------------------ */

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'mint';

const TONE: Record<Tone, string> = {
  neutral: 'bg-silver-100 text-ink border-line',
  brand: 'bg-brand-50 text-brand-800 border-brand-100',
  success: 'bg-ok-50 text-ok-700 border-ok-50',
  warning: 'bg-warn-50 text-warn-700 border-warn-200',
  danger: 'bg-danger-50 text-danger-700 border-danger-200',
  info: 'bg-info-50 text-info-600 border-info-50',
  mint: 'bg-mint-50 text-mint-700 border-mint-100',
};

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap', TONE[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/* ------------------------------ Layout ------------------------------ */

export function Card({ children, className, as: As = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <As className={clsx('rounded-lg border border-line bg-surface shadow-card', className)}>{children}</As>;
}

export function CardHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, meta }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-[13.5px] text-muted">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = 'neutral',
  to,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  to?: string;
  icon?: LucideIcon;
}) {
  const accent: Record<Tone, string> = {
    neutral: 'text-ink',
    brand: 'text-brand-700',
    success: 'text-ok-700',
    warning: 'text-warn-700',
    danger: 'text-danger-700',
    info: 'text-info-600',
    mint: 'text-mint-700',
  };
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-[12.5px] font-medium text-muted">
        <span>{label}</span>
        {Icon && <Icon className="size-4 text-subtle" aria-hidden />}
      </div>
      <div className={clsx('mt-1.5 text-2xl font-semibold tracking-tight tabular', accent[tone])}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </>
  );
  const cls = 'block rounded-lg border border-line bg-surface p-3.5 shadow-card';
  return to ? (
    <Link to={to} className={clsx(cls, 'transition-colors hover:border-brand-300 hover:bg-brand-50/40')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function EmptyState({ icon: Icon = Info, title, body, action }: { icon?: LucideIcon; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-md text-[13px] text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Callout({ tone = 'info', title, children, className, icon }: { tone?: 'info' | 'warning' | 'danger' | 'success' | 'neutral'; title?: ReactNode; children?: ReactNode; className?: string; icon?: LucideIcon }) {
  const map = {
    info: ['bg-info-50 border-info-600/20 text-ink', Info, 'text-info-600'],
    warning: ['bg-warn-50 border-warn-200 text-ink', AlertTriangle, 'text-warn-600'],
    danger: ['bg-danger-50 border-danger-200 text-ink', XCircle, 'text-danger-600'],
    success: ['bg-ok-50 border-ok-600/20 text-ink', CheckCircle2, 'text-ok-600'],
    neutral: ['bg-canvas border-line text-ink', Info, 'text-muted'],
  } as const;
  const [cls, DefIcon, iconCls] = map[tone];
  const I = icon ?? DefIcon;
  return (
    <div className={clsx('flex gap-2.5 rounded-md border px-3 py-2.5 text-[13px]', cls, className)} role={tone === 'danger' ? 'alert' : undefined}>
      <I className={clsx('mt-0.5 size-4 shrink-0', iconCls)} aria-hidden />
      <div className="min-w-0">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className={clsx(title && 'mt-0.5', 'text-muted [&_strong]:text-ink')}>{children}</div>}
      </div>
    </div>
  );
}

export function ProgressBar({ value, tone = 'brand', className, label }: { value: number; tone?: 'brand' | 'warning' | 'danger' | 'success'; className?: string; label?: string }) {
  const c = { brand: 'bg-brand-500', warning: 'bg-warn-600', danger: 'bg-danger-600', success: 'bg-mint-500' }[tone];
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-silver-100', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={clsx('h-full rounded-full', c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Avatar({ name, size = 'md', tone }: { name: string; size?: 'sm' | 'md' | 'lg'; tone?: 'brand' | 'mint' | 'silver' }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
  const palette = ['bg-brand-100 text-brand-800', 'bg-mint-100 text-mint-700', 'bg-silver-100 text-ink'];
  const idx = tone ? { brand: 0, mint: 1, silver: 2 }[tone] : name.length % 3;
  const s = { sm: 'size-7 text-[11px]', md: 'size-9 text-xs', lg: 'size-14 text-lg' }[size];
  return (
    <span className={clsx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', s, palette[idx])} aria-hidden>
      {initials}
    </span>
  );
}

export function KeyValue({ items, cols = 2 }: { items: { k: ReactNode; v: ReactNode }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={clsx('grid gap-x-6 gap-y-3', cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3')}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-medium text-muted">{it.k}</dt>
          <dd className="mt-0.5 text-[13.5px] break-words text-ink">{it.v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------ Form controls ------------------------------ */

export function Field({ label, hint, error, children, required, className, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; required?: boolean; className?: string; htmlFor?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-[13px] font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-danger-600" aria-hidden>*</span>}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-danger-700">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx('input', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx('input pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx('input min-h-[72px]', className)} {...rest} />;
}

export function SearchInput({ value, onChange, placeholder = 'Search', className, label = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; label?: string }) {
  return (
    <div className={clsx('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" aria-hidden />
      <input aria-label={label} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input pl-8" />
    </div>
  );
}

export function Checkbox({ checked, onChange, label, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; id?: string }) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <label htmlFor={cid} className={clsx('inline-flex items-center gap-2 text-[13px]', disabled ? 'text-subtle' : 'text-ink')}>
      <input id={cid} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="size-4 rounded border-line-strong accent-brand-600" />
      {label}
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, size = 'sm' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; label: string; size?: 'sm' | 'md' }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-md border border-line bg-canvas p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-[5px] font-medium whitespace-nowrap transition-colors',
            size === 'sm' ? 'px-2.5 py-1 text-[13px]' : 'px-3 py-1.5 text-sm',
            value === o.value ? 'bg-white text-ink shadow-card' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
          {o.count !== undefined && (
            <span className={clsx('rounded-full px-1.5 text-[11px] tabular', value === o.value ? 'bg-brand-50 text-brand-800' : 'bg-silver-100 text-muted')}>{o.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div role="tablist" className="-mb-px flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={clsx(
            'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13.5px] font-medium whitespace-nowrap',
            value === t.value ? 'border-brand-600 text-brand-800' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className="rounded-full bg-silver-100 px-1.5 text-[11px] text-muted tabular">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Overlays ------------------------------ */

function useEscape(onClose: () => void, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, open]);
}

function useFocusTrap(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () => Array.from(el?.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? []);
    const first = focusables().find((x) => x.dataset.autofocus !== undefined) ?? focusables()[0];
    first?.focus();
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault();
        f[0].focus();
      }
    };
    el?.addEventListener('keydown', h);
    return () => {
      el?.removeEventListener('keydown', h);
      prev?.focus?.();
    };
  }, [open]);
  return ref;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEscape(onClose, open);
  const ref = useFocusTrap(open);
  const titleId = useId();
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={clsx('relative flex max-h-[92vh] w-full flex-col rounded-t-xl bg-white shadow-pop sm:rounded-xl', w)}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} className="-mt-1 -mr-2" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children?: ReactNode; footer?: ReactNode; width?: 'md' | 'lg' }) {
  useEscape(onClose, open);
  const ref = useFocusTrap(open);
  const titleId = useId();
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={clsx('relative flex h-full w-full flex-col bg-white shadow-pop', width === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl')}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              {title}
            </h2>
            {subtitle && <div className="mt-0.5 text-[13px] text-muted">{subtitle}</div>}
          </div>
          <IconButton icon={X} label="Close panel" onClick={onClose} className="-mt-1 -mr-2" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Confirm',
  tone = 'primary',
  children,
  confirmDisabled,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  body?: ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  children?: ReactNode;
  confirmDisabled?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} disabled={confirmDisabled} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body && <div className="text-[13.5px] text-muted">{body}</div>}
      {children}
    </Modal>
  );
}

/* ------------------------------ Toasts ------------------------------ */

export function Toaster() {
  const toasts = usePoise((s) => s.toasts);
  const dismiss = usePoise((s) => s.dismissToast);
  const icon = { success: CheckCircle2, info: Info, warning: AlertTriangle, error: XCircle } as const;
  const color = { success: 'text-ok-600', info: 'text-info-600', warning: 'text-warn-600', error: 'text-danger-600' } as const;
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 left-4 z-[60] flex flex-col items-end gap-2 sm:left-auto">
      {toasts.map((t) => {
        const I = icon[t.tone];
        return (
          <div key={t.id} role="status" className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border border-line bg-white px-3.5 py-3 shadow-pop">
            <I className={clsx('mt-0.5 size-4 shrink-0', color[t.tone])} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium text-ink">{t.title}</p>
              {t.body && <p className="mt-0.5 text-[12.5px] text-muted">{t.body}</p>}
            </div>
            <IconButton icon={X} label="Dismiss" onClick={() => dismiss(t.id)} className="-mt-1 -mr-1 size-6" />
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------ Misc ------------------------------ */

export function DeptDot({ color }: { color: string }) {
  return <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />;
}

export function TableWrap({ children, className, maxHeight }: { children: ReactNode; className?: string; maxHeight?: string }) {
  return (
    <div className={clsx('overflow-auto', className)} style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full border-separate border-spacing-0 text-[13px]">{children}</table>
    </div>
  );
}

export function PlannedNote({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-dashed border-silver-400 px-1.5 py-0.5 text-[11px] font-medium text-muted">
      Planned · {children}
    </span>
  );
}
