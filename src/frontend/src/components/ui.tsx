import { ArrowLeft, Calendar, ChartNoAxesColumn, Database, House, Map, Plus, Sprout, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

const NAV = [
  { to: '/fields', label: 'My fields', icon: <Sprout size={28} strokeWidth={2.2} />, end: true },
  { to: '/history', label: 'Plot history', icon: <Calendar size={30} strokeWidth={2.2} /> },
  { to: '/statistics', label: 'Statistics', icon: <ChartNoAxesColumn size={30} strokeWidth={2.6} /> },
  { to: '/data', label: 'Data', icon: <Database size={24} strokeWidth={2.2} /> },
  {
    to: '/fields/new',
    label: 'Add field',
    icon: <span className="nav-add"><Map size={24} strokeWidth={2.2} /><Plus size={12} strokeWidth={2.4} /></span>,
  },
];

export function Sidebar() {
  return (
    <nav className="sidebar" aria-label="Main">
      <NavLink to="/" className="nav-home" aria-label="Home"><House size={32} strokeWidth={2.4} /></NavLink>
      <div className="nav-items">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} className="nav-item" end={'end' in item}>
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
      <button className="nav-user" aria-label="Account"><User size={34} strokeWidth={2.2} /></button>
    </nav>
  );
}

/** Left panel: 72 px header + scrolling body, as in the Figma frames. */
export function Panel({ title, brand, wide, children }: { title: string; brand?: boolean; wide?: boolean; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <main className={`panel ${wide ? 'panel-wide' : ''}`}>
      <header className="panel-header">
        <h1 className={brand ? 'brand' : ''}>{title}</h1>
        {brand && <button aria-label="Back" onClick={() => navigate(-1)}><ArrowLeft size={16} /></button>}
      </header>
      <div className="panel-body">
        {children}
        <p className="judgment-note">
          Decision support only. It does not replace local experience: check with your agronomist and neighboring farmers.
        </p>
      </div>
    </main>
  );
}

export function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}

/**
 * Action button. Greyed out (and not clickable) whenever the action is not possible: `disabled` is the only switch,
 * so the screen never shows an enabled button that does nothing.
 */
export function Btn({
  variant = 'primary', disabled, onClick, children,
}: { variant?: 'primary' | 'save' | 'secondary'; disabled?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`btn btn-${variant}`} disabled={disabled} onClick={onClick}>{children}</button>
  );
}

/** Status line for loading, errors and "not available" (instead of showing made-up numbers). */
export function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'loading'; children: ReactNode }) {
  return <div className={`note-box notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function ReadField({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="read-field">
      <span className="label">{label}</span>
      <div className={`box ${small ? 'box-small' : ''}`}>{value}</div>
    </div>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o} type="button" className="chip" aria-pressed={o === value} onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  );
}

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
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className={`slider ${tone ? `slider-${tone}` : ''}`}>
      <span className="slider-head">{icon}<span>{label}</span><output>{display}</output></span>
      <span className="slider-track">
        <span className="slider-fill" style={{ width: `${pct}%`, backgroundSize: `${10000 / Math.max(pct, 1)}% 100%` }} />
        <span className="slider-thumb" style={{ left: `${pct}%` }} />
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      </span>
      <span className="slider-marks">{marks.map((m) => <span key={m}>{m}</span>)}</span>
    </label>
  );
}

/** Vertical priority bar used in "Add field". */
export function PriorityBar({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="priority">
      <span className="priority-label">{label}</span>
      <span className="priority-track">
        <span className="priority-fill" style={{ height: `${value}%` }} />
        <input type="range" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      </span>
    </label>
  );
}
