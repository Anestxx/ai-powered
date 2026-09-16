import React, { useEffect, useRef } from 'react';
import { Car, Construction, Droplets, Inbox, TriangleAlert, X } from 'lucide-react';
import { EVENT_TYPES, STATUSES } from '../lib/events';

export function TypeIcon({ type, size = 19 }) {
  const config = EVENT_TYPES[type] || { icon: 'alert', color: '#8291a6' };
  const Icon = { car: Car, road: Construction, water: Droplets, alert: TriangleAlert }[config.icon];
  return <span className="type-icon" style={{ '--event-color': config.color }}><Icon size={size} /></span>;
}
export function Badge({ value, status = false }) {
  return <span className={`badge ${value}`}>{status ? STATUSES[value] || value : value}</span>;
}
export function EmptyState({ title = 'No incidents to display', children, action }) {
  return <div className="empty-state"><span className="empty-icon"><Inbox size={25} /></span><h3>{title}</h3><p>{children}</p>{action}</div>;
}
export function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null), closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement, previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const container = ref.current;
    const focusable = () => [...container.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')];
    (focusable()[0] || container).focus();
    const handleKey = event => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const items = focusable(), first = items[0], last = items[items.length - 1];
        if (!items.length) { event.preventDefault(); container.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === container)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1}>
      <div className="modal-heading"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></div>{children}
    </section>
  </div>;
}
