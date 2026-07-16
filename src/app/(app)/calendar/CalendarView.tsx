'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge, Card } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';

interface Post {
  id: string;
  body: string;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  targets: Array<{ platform: string }>;
}

function variant(status: string): BadgeVariant {
  if (status === 'published') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'partial') return 'warning';
  return 'info';
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function CalendarView() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const load = () =>
    fetch('/api/posts')
      .then((res) => (res.ok ? res.json() : { posts: [] }))
      .then((d: { posts: Post[] }) => setPosts(d.posts))
      .catch(() => setPosts([]));

  useEffect(() => {
    load();
  }, []);

  /** Drop a scheduled post onto a day: keep its time-of-day, move it to that date. */
  async function reschedule(postId: string, day: Date) {
    const post = posts.find((p) => p.id === postId);
    if (!post || post.status !== 'scheduled') return;
    const prev = post.scheduledAt ? new Date(post.scheduledAt) : null;
    const target = new Date(day);
    target.setHours(prev ? prev.getHours() : 9, prev ? prev.getMinutes() : 0, 0, 0);
    if (prev && dayKey(prev) === dayKey(target)) return; // same day — no-op
    const iso = target.toISOString();
    setPosts((ps) => ps.map((p) => (p.id === postId ? { ...p, scheduledAt: iso } : p))); // optimistic
    await fetch(`/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledAt: iso }),
    }).catch(() => undefined);
    load();
  }

  const byDay = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const post of posts) {
      const when = post.scheduledAt ?? post.publishedAt;
      if (!when) continue;
      const key = dayKey(new Date(when));
      map.set(key, [...(map.get(key) ?? []), post]);
    }
    return map;
  }, [posts]);

  const weeks = useMemo(() => {
    const first = new Date(cursor);
    const startOffset = (first.getDay() + 6) % 7; // Monday-first
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - startOffset);
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      cells.push(d);
    }
    const out: Date[][] = [];
    for (let i = 0; i < 6; i++) out.push(cells.slice(i * 7, i * 7 + 7));
    return out;
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const todayKey = dayKey(new Date());

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month">
          <ChevronLeft size={18} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{monthLabel}</h2>
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month">
          <ChevronRight size={18} style={{ color: 'var(--text-secondary)' }} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="px-2 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--border-primary)' }}>
        {weeks.flat().map((day) => {
          const key = dayKey(day);
          const inMonth = day.getMonth() === cursor.getMonth();
          const dayPosts = byDay.get(key) ?? [];
          return (
            <div
              key={key}
              onDragOver={(e) => {
                if (dragId) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) void reschedule(dragId, day);
                setDragId(null);
              }}
              className="min-h-20 p-1.5"
              style={{
                backgroundColor: dragId ? 'var(--bg-secondary)' : 'var(--bg-card)',
                opacity: inMonth ? 1 : 0.45,
              }}
            >
              <p
                className="text-xs mb-1 font-medium"
                style={{ color: key === todayKey ? 'var(--brand-primary)' : 'var(--text-muted)' }}
              >
                {day.getDate()}
              </p>
              <div className="space-y-1">
                {dayPosts.slice(0, 3).map((post) => {
                  const draggable = post.status === 'scheduled';
                  return (
                    <div
                      key={post.id}
                      draggable={draggable}
                      onDragStart={(e) => {
                        setDragId(post.id);
                        e.dataTransfer.setData('text/plain', post.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => router.push('/posts')}
                      title={draggable ? `${post.body}\n\nDrag to another day to reschedule` : post.body}
                      className={`block truncate rounded px-1.5 py-0.5 text-[11px] ${draggable ? 'cursor-grab' : 'cursor-pointer'}`}
                      style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                    >
                      <Badge variant={variant(post.status)}>{post.targets.length}</Badge>{' '}
                      {post.body.slice(0, 18) || '(no text)'}
                    </div>
                  );
                })}
                {dayPosts.length > 3 && (
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>+{dayPosts.length - 3} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
