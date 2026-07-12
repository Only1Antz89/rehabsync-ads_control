'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { Button, Card } from '@/components/ui';

interface Slot {
  id: string;
  weekday: number;
  minutes: number;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function QueueManager() {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [weekday, setWeekday] = useState(1);
  const [time, setTime] = useState('09:00');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/queue/slots')
      .then((r) => (r.ok ? r.json() : { slots: [], next: null }))
      .then((d: { slots: Slot[]; next: string | null }) => {
        setSlots(d.slots);
        setNext(d.next);
      })
      .catch(() => setSlots([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    const [h, m] = time.split(':').map(Number);
    const minutes = (h ?? 0) * 60 + (m ?? 0);
    setBusy('add');
    setError(null);
    try {
      const res = await fetch('/api/queue/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekday, minutes }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(d?.error ?? 'Could not add slot.');
        return;
      }
      load();
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/queue/slots/${id}`, { method: 'DELETE' });
      load();
    } finally {
      setBusy(null);
    }
  }

  const byDay = (d: number) => (slots ?? []).filter((s) => s.weekday === d).sort((a, b) => a.minutes - b.minutes);

  return (
    <div className="space-y-5">
      <Card title="Add a slot">
        <form onSubmit={addSlot} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Day</label>
            <select
              value={weekday}
              onChange={(e) => setWeekday(Number(e.target.value))}
              className="rounded-lg border px-3 py-2 text-sm"
              style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
            >
              {DAYS.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Time (UTC)</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
              style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
            />
          </div>
          <Button type="submit" loading={busy === 'add'}>
            <Plus size={14} className="mr-1" /> Add
          </Button>
          {error && <span className="text-sm w-full" style={{ color: 'var(--color-error-text)' }}>{error}</span>}
        </form>
        {next && (
          <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
            Next free slot: {new Date(next).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
          </p>
        )}
      </Card>

      <Card title="Weekly schedule">
        {slots === null ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
        ) : slots.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No slots yet — add a few times above to build your cadence.</p>
        ) : (
          <div className="space-y-3">
            {DAYS.map((day, i) => {
              const daySlots = byDay(i);
              if (daySlots.length === 0) return null;
              return (
                <div key={day} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium w-24 shrink-0" style={{ color: 'var(--text-primary)' }}>{day}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {daySlots.map((s) => (
                      <span key={s.id} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs border" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
                        {hhmm(s.minutes)}
                        <button onClick={() => void remove(s.id)} disabled={busy === s.id} aria-label="Remove slot" style={{ color: 'var(--color-error-text)' }}>
                          <Trash2 size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
