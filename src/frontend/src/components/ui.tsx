import {
  ArrowLeft, Calendar, ChartNoAxesColumn, Check, CircleAlert, Database, Ellipsis, House, Info, Map, PanelLeftClose, Plus,
  ShieldAlert, Sprout, User, Wheat,
} from 'lucide-react';
import {
  useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type KeyboardEvent,
  type MouseEvent, type ReactNode,
} from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSheet } from '../AppContext';
import { prefersReducedMotion } from '../layout';
import { createSheet, SNAP_ORDER, type Follower, type Snap } from '../sheet';

/* ---------- navigation ---------- */

const AddFieldIcon = () => (
  <span className="nav-add" aria-hidden><Map size={24} strokeWidth={2} /><Plus size={12} strokeWidth={2.4} /></span>
);

const NAV: { to: string; label: string; icon: ReactNode; end?: boolean }[] = [
  { to: '/fields', label: 'My fields', icon: <Sprout size={24} strokeWidth={2} aria-hidden />, end: true },
  { to: '/risks', label: 'Risks', icon: <ShieldAlert size={24} strokeWidth={2} aria-hidden /> },
  { to: '/crops', label: 'Crops', icon: <Wheat size={24} strokeWidth={2} aria-hidden /> },
  { to: '/history', label: 'Plot history', icon: <Calendar size={24} strokeWidth={2} aria-hidden /> },
  { to: '/statistics', label: 'Statistics', icon: <ChartNoAxesColumn size={24} strokeWidth={2} aria-hidden /> },
  { to: '/data', label: 'Data', icon: <Database size={24} strokeWidth={2} aria-hidden /> },
  { to: '/fields/new', label: 'Add field', icon: <AddFieldIcon /> },
];
/** Bottom bar in sheet mode: Home + the three most used destinations; the rest live under More. */
const BAR = NAV.slice(0, 3);
const MORE = NAV.slice(3);

export function Sidebar() {
  const { isSheet } = useSheet();
  return isSheet ? <BottomNav /> : <SideNav />;
}

function SideNav() {
  return (
    <nav className="sidebar" aria-label="Main">
      <NavLink to="/" className="nav-home" aria-label="Home"><House size={28} strokeWidth={2.2} aria-hidden /></NavLink>
      <div className="nav-items">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} className="nav-item" end={item.end} data-label={item.label}>
            {item.icon}
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </div>
      <button type="button" className="nav-user" aria-label="Account"><User size={28} strokeWidth={2} aria-hidden /></button>
    </nav>
  );
}

const popoverSupported = typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype;

function BottomNav() {
  const { pathname } = useLocation();
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const inMore = MORE.some((item) => item.to === pathname);

  // Native popover: Esc and outside clicks close it. Focus goes back to More after Esc, or when it was inside the menu.
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu || !popoverSupported) return;
    let escaped = false;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') escaped = true;
    };
    const onToggle = (e: Event) => {
      const isOpen = (e as Event & { newState?: string }).newState === 'open';
      setOpen(isOpen);
      if (isOpen) {
        escaped = false;
        document.addEventListener('keydown', onKey, true);
        return;
      }
      document.removeEventListener('keydown', onKey, true);
      if (escaped || menu.contains(document.activeElement) || document.activeElement === document.body) moreRef.current?.focus();
    };
    menu.addEventListener('toggle', onToggle);
    return () => {
      menu.removeEventListener('toggle', onToggle);
      document.removeEventListener('keydown', onKey, true);
    };
  }, []);

  // Fallback for browsers without the popover API: same behaviour with state.
  useEffect(() => {
    if (popoverSupported || !open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        moreRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !moreRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const toggle = () => {
    const menu = menuRef.current;
    if (popoverSupported && menu) menu.togglePopover();
    else setOpen((v) => !v);
  };
  const close = () => {
    const menu = menuRef.current;
    if (popoverSupported && menu?.matches(':popover-open')) menu.hidePopover();
    else setOpen(false);
  };
  const popoverAttrs = (popoverSupported ? { popover: 'auto' } : { hidden: !open, 'data-fallback': '' }) as Record<string, unknown>;

  return (
    <nav className="bottom-nav" aria-label="Main">
      <NavLink to="/" className="bottom-item" aria-label="Home">
        <span className="pill"><House size={24} strokeWidth={2} aria-hidden /></span>
        <span className="bottom-label">Home</span>
      </NavLink>
      {BAR.map((item) => (
        <NavLink key={item.to} to={item.to} className="bottom-item" end={item.end}>
          <span className="pill">{item.icon}</span>
          <span className="bottom-label">{item.label}</span>
        </NavLink>
      ))}
      <button
        ref={moreRef} type="button" className={`bottom-item ${inMore ? 'is-active' : ''}`}
        aria-expanded={open} aria-controls="nav-more" aria-haspopup="true" onClick={toggle}
      >
        <span className="pill"><Ellipsis size={24} strokeWidth={2} aria-hidden />{inMore && <i className="more-dot" aria-hidden />}</span>
        <span className="bottom-label">More</span>
      </button>
      <div ref={menuRef} id="nav-more" className="more-menu" {...popoverAttrs}>
        <ul>
          {MORE.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end} onClick={close}>{item.icon}<span>{item.label}</span></NavLink>
            </li>
          ))}
          <li>
            <button type="button" className="nav-user-row" aria-label="Account"><User size={24} strokeWidth={2} aria-hidden /><span aria-hidden>Account</span></button>
          </li>
        </ul>
      </div>
    </nav>
  );
}

/* ---------- panel (side panel or bottom sheet) ---------- */

const SNAP_ANNOUNCE: Record<Snap, string> = { expanded: 'Panel expanded', half: 'Panel half open', peek: 'Panel collapsed' };

/** Map overlays that move with the sheet while it is dragged or snapping. */
const sheetFollowers = (): Follower[] => [
  ...Array.from(document.querySelectorAll<HTMLElement>('.map [data-sheet-follow]')).map((el) => ({
    el, ratio: Number(el.dataset.sheetFollow) || 1,
  })),
  ...Array.from(document.querySelectorAll<HTMLElement>('.map .maplibregl-ctrl-bottom-right')).map((el) => ({ el, ratio: 1 })),
];

interface PanelProps {
  title: string;
  brand?: boolean;
  wide?: boolean;
  /** Always-visible strip under the header (drawing status in "Add a field"). */
  status?: ReactNode;
  children: ReactNode;
}

/**
 * The page panel. Desktop and tablet: a column next to the map. Sheet mode: the same <main> becomes a bottom sheet
 * over the map, with a handle (button) and drag on handle + header. Nothing is unmounted when switching modes.
 */
export function Panel({ title, brand, wide, status, children }: PanelProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const sheet = useSheet();
  const sheetMode = sheet.isSheet && !wide;
  const mainRef = useRef<HTMLElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const main = mainRef.current;
    const app = main?.closest<HTMLElement>('.app');
    if (!sheetMode || !main || !app || !handleRef.current || !headerRef.current) return;
    const controller = createSheet({
      sheet: main,
      handle: handleRef.current,
      header: headerRef.current,
      status: () => statusRef.current,
      followers: sheetFollowers,
      app,
      getSnap: () => sheet.snapRef.current,
      onSettle: sheet.onSettled,
      onTarget: (h, ms) => sheet.mapTargetRef.current?.(h, ms),
      reduced: prefersReducedMotion,
    });
    sheet.controllerRef.current = controller;
    // Route snaps (05 §5.3): drawing starts collapsed so the map is the tool; anywhere else peek opens to half.
    const target: Snap | null = pathname === '/fields/new' ? 'peek' : sheet.snapRef.current === 'peek' ? 'half' : null;
    if (target && target !== sheet.snapRef.current) controller.snapTo(target, { source: 'auto' });
    const observer = new ResizeObserver(() => controller.refresh());
    if (statusRef.current) observer.observe(statusRef.current);
    observer.observe(headerRef.current);
    return () => {
      observer.disconnect();
      controller.destroy();
      if (sheet.controllerRef.current === controller) sheet.controllerRef.current = null;
    };
    // The controller lives as long as this panel stays in sheet mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetMode]);

  const cycle = (source: 'tap' | 'key') => sheet.snapTo(sheet.snap === 'expanded' ? 'half' : SNAP_ORDER[SNAP_ORDER.indexOf(sheet.snap) + 1], source);
  const onHandleKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = SNAP_ORDER.indexOf(sheet.snap);
    if (e.key === 'ArrowUp' && i < SNAP_ORDER.length - 1) sheet.snapTo(SNAP_ORDER[i + 1], 'key');
    else if (e.key === 'ArrowDown' && i > 0) sheet.snapTo(SNAP_ORDER[i - 1], 'key');
    else return;
    e.preventDefault();
  };
  const onHeaderClick = (e: MouseEvent<HTMLElement>) => {
    if (!sheetMode || (e.target as Element).closest('button, a')) return;
    cycle('tap');
  };
  const onPanelKey = (e: KeyboardEvent<HTMLElement>) => {
    if (!sheetMode || e.key !== 'Escape' || sheet.snap !== 'expanded') return;
    sheet.snapTo('half', 'key');
    handleRef.current?.focus();
  };
  // Desktop "Hide panel": fade the content out (06 §6.5), then collapse the column at once (a single map resize).
  const hidePanel = async () => {
    const main = mainRef.current;
    if (main && !prefersReducedMotion()) {
      await main.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }).finished.catch(() => undefined);
    }
    sheet.setPanelOpen(false);
  };
  const onBodyFocus = () => {
    if (sheetMode && sheet.snapRef.current === 'peek') sheet.snapTo('half', 'auto');
  };

  return (
    <main
      ref={mainRef} id="panel" tabIndex={-1}
      className={`panel ${wide ? 'panel-wide' : ''} ${sheetMode ? 'is-sheet' : ''}`}
      data-snap={sheetMode ? sheet.snap : undefined} onKeyDown={onPanelKey}
    >
      {sheetMode && (
        <button
          ref={handleRef} type="button" className="sheet-handle"
          aria-controls="panel-body" aria-expanded={sheet.snap === 'expanded'}
          aria-label={sheet.snap === 'expanded' ? 'Collapse panel' : 'Expand panel'}
          onClick={(e) => cycle(e.detail === 0 ? 'key' : 'tap')} onKeyDown={onHandleKey}
        />
      )}
      <header ref={headerRef} className="panel-header" onClick={onHeaderClick}>
        <h1 id="panel-title" className={brand ? 'brand' : ''}>{title}</h1>
        <span className="panel-header-actions">
          {brand && (
            <button type="button" className="icon-btn" aria-label="Back" onClick={() => navigate(-1)}>
              <ArrowLeft size={20} aria-hidden />
            </button>
          )}
          {!sheet.isSheet && !wide && (
            <button type="button" className="icon-btn hide-panel" aria-label="Hide panel" title="Hide panel" onClick={hidePanel}>
              <PanelLeftClose size={20} aria-hidden />
            </button>
          )}
        </span>
      </header>
      {status && <div ref={statusRef} className="panel-status" role="status">{status}</div>}
      <div id="panel-body" className="panel-body" onFocus={onBodyFocus}>
        {children}
        <p className="judgment-note">
          Decision support only. It does not replace local experience: check with your agronomist and neighboring farmers.
        </p>
      </div>
      {sheetMode && <span className="sr-only" aria-live="polite">{SNAP_ANNOUNCE[sheet.snap]}</span>}
    </main>
  );
}

/* ---------- content blocks ---------- */

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: string;
  /** id for the h2, so a control in the card can be labelled by it. */
  titleId?: string;
  /** Reloading with the previous data still shown: thin progress bar + aria-busy. */
  busy?: boolean;
  children: ReactNode;
}

export function Card({ title, titleId, busy, children, className = '', ...rest }: CardProps) {
  return (
    <section className={`card ${className}`} aria-busy={busy || undefined} {...rest}>
      {title && <h2 id={titleId}>{title}</h2>}
      {children}
    </section>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}

interface BtnProps {
  variant?: 'primary' | 'save' | 'secondary';
  size?: 'md' | 'sm';
  disabled?: boolean;
  /** Keeps the button focusable (aria-disabled), shows a spinner + `loadingLabel` and ignores clicks. */
  loading?: boolean;
  loadingLabel?: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  children: ReactNode;
}

/**
 * Action button. Greyed out (and not clickable) whenever the action is not possible: `disabled` is the only switch,
 * so the screen never shows an enabled button that does nothing. Both labels share one grid cell, so the button keeps
 * the width of the wider one when it switches to loading.
 */
export function Btn({ variant = 'primary', size = 'md', disabled, loading, loadingLabel, icon, onClick, children }: BtnProps) {
  return (
    <button
      type="button" className={`btn btn-${variant} btn-${size}`}
      disabled={disabled && !loading} aria-disabled={loading || undefined} aria-busy={loading || undefined}
      onClick={loading ? undefined : onClick}
    >
      <span className="btn-label">{icon}{children}</span>
      {loadingLabel !== undefined && <span className="btn-loading"><Spinner />{loadingLabel}</span>}
    </button>
  );
}

/** Status line for loading, errors and "not available" (instead of showing made-up numbers). */
export function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'loading'; children: ReactNode }) {
  const icon = kind === 'loading' ? <Spinner /> : kind === 'error' ? <CircleAlert size={16} aria-hidden /> : <Info size={16} aria-hidden />;
  return (
    <div className={`note-box notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span className="notice-icon">{icon}</span>
      <div className="notice-text">{children}</div>
    </div>
  );
}

export function ReadField({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="read-field">
      <span className="label">{label}</span>
      <div className={`box ${small ? 'box-small' : ''}`}>{value}</div>
    </div>
  );
}

/* ---------- chips ---------- */

/** Chip content: a reserved check slot and a label that pre-reserves its bold width, so selecting never moves anything. */
function ChipBody({ text, on }: { text: string; on: boolean }) {
  return (
    <>
      <span className="chip-check" aria-hidden>{on && <Check size={14} strokeWidth={3} />}</span>
      <span className="chip-text" data-label={text}>{text}</span>
    </>
  );
}

interface ChipsProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labelOf?: (v: T) => string;
  /** Accessible name of the group: id of a visible heading, or a label. */
  labelledBy?: string;
  label?: string;
}

/** Single choice: a radio group with a roving tab stop and arrow keys. */
export function Chips<T extends string>({ options, value, onChange, labelOf = (v) => v, labelledBy, label }: ChipsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = options.indexOf(value);
  const move = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = options.length - 1;
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i === last ? 0 : i + 1)
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i === 0 ? last : i - 1)
        : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next]);
    refs.current[next]?.focus();
  };
  return (
    <div className="chips" role="radiogroup" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : label}>
      {options.map((o, i) => (
        <button
          key={o} ref={(el) => { refs.current[i] = el; }} type="button" className="chip" role="radio"
          aria-checked={o === value} tabIndex={i === (current < 0 ? 0 : current) ? 0 : -1}
          onClick={() => onChange(o)} onKeyDown={(e) => move(e, i)}
        >
          <ChipBody text={labelOf(o)} on={o === value} />
        </button>
      ))}
    </div>
  );
}

/** Multiple choice chip: a toggle button. */
export function ToggleChip({ label, pressed, onToggle }: { label: string; pressed: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onToggle}>
      <ChipBody text={label} on={pressed} />
    </button>
  );
}

/* ---------- tabs ---------- */

interface TabsProps<T extends string> {
  tabs: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  /** id of the tabpanel the tabs control; each tab gets the id `${panelId}-tab-${id}`. */
  panelId: string;
}

export const tabId = (panelId: string, id: string) => `${panelId}-tab-${id}`;

export function Tabs<T extends string>({ tabs, value, onChange, panelId }: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = tabs.length - 1;
    const next = e.key === 'ArrowRight' ? (i === last ? 0 : i + 1)
      : e.key === 'ArrowLeft' ? (i === 0 ? last : i - 1)
        : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t, i) => (
        <button
          key={t.id} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" id={tabId(panelId, t.id)}
          aria-selected={t.id === value} aria-controls={panelId} tabIndex={t.id === value ? 0 : -1}
          onClick={() => onChange(t.id)} onKeyDown={(e) => move(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- sliders ---------- */

interface SliderProps {
  icon?: ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display: string;
  marks: [string, string, string];
  /** Color scale of the track: rain goes dry (red) to wet (blue); heat goes cold (blue) to hot (red). */
  tone?: 'rain' | 'heat';
  onChange: (v: number) => void;
}

/** Horizontal "What if?" slider: gradient fill up to a navy thumb. */
export function Slider({ icon, label, value, min, max, step = 1, display, marks, tone, onChange }: SliderProps) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={`slider ${tone ? `slider-${tone}` : ''}`}>
      <div className="slider-head">
        {icon}
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{display}</output>
      </div>
      <span className="slider-track">
        <span className="slider-fill" style={{ width: `${pct}%`, backgroundSize: `${10000 / Math.max(pct, 1)}% 100%` }} />
        <span className="slider-thumb" style={{ left: `${pct}%` }} />
        <input
          id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={display}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </span>
      <span className="slider-marks" aria-hidden>{marks.map((m, i) => <span key={`${i}-${m}`}>{m}</span>)}</span>
    </div>
  );
}

/** Priority bar used in the field form: vertical in a wide card, horizontal in a narrow one (container query). */
export function PriorityBar({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div className="priority">
      <label className="priority-label" htmlFor={id}>{label}</label>
      <output className="priority-value" htmlFor={id}>{value}</output>
      <span className="priority-track" style={{ '--v': value } as CSSProperties}>
        <span className="priority-fill" />
        <input
          id={id} type="range" min={0} max={100} value={value} aria-valuetext={`${value} out of 100`}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </span>
    </div>
  );
}

