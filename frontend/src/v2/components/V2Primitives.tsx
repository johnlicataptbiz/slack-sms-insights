import { useId, type ReactNode } from 'react';

import { V2_TERM_DEFINITIONS, type V2TermKey } from '../copy';

export function V2PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: string;
  right?: ReactNode;
}) {
  return (
    <header className="V2PageHeader">
      <div>
        <p className="V2PageHeader__eyebrow">PT Biz Setter Ops</p>
        <h1>{title}</h1>
        <p className="V2PageHeader__subtitle">{subtitle}</p>
      </div>
      {right ? <div className="V2PageHeader__right">{right}</div> : null}
    </header>
  );
}

export function V2Panel({
  title,
  caption,
  children,
  className,
}: {
  title?: ReactNode;
  caption?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`V2Panel ${className || ''}`.trim()}>
      {title ? <h2 className="V2Panel__title">{title}</h2> : null}
      {caption ? <p className="V2Panel__caption">{caption}</p> : null}
      {children}
    </section>
  );
}

export function V2MetricCard({
  label,
  value,
  meta,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  meta?: ReactNode;
  tone?: 'default' | 'positive' | 'critical' | 'accent';
}) {
  return (
    <article className={`V2MetricCard ${tone ? `V2MetricCard--${tone}` : ''}`}>
      <p className="V2MetricCard__label">{label}</p>
      <p className="V2MetricCard__value">{value}</p>
      {meta ? <p className="V2MetricCard__meta">{meta}</p> : null}
    </article>
  );
}

export function V2State({ kind, children }: { kind: 'loading' | 'error' | 'empty'; children: ReactNode }) {
  return <div className={`V2State V2State--${kind}`}>{children}</div>;
}

export function V2Term({ term, label }: { term: V2TermKey; label?: ReactNode }) {
  const id = useId();
  const definition = V2_TERM_DEFINITIONS[term];
  const text = label ?? definition.label;

  return (
    <span className="V2Term">
      <button className="V2Term__button" type="button" aria-describedby={id}>
        <span>{text}</span>
        <span className="V2Term__badge" aria-hidden="true">
          i
        </span>
      </button>
      <span className="V2Term__tooltip" id={id} role="tooltip">
        <strong>{definition.label}</strong>
        <span>{definition.definition}</span>
      </span>
    </span>
  );
}
