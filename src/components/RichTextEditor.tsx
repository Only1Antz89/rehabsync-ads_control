'use client';

// Lightweight dependency-free rich-text editor for email/newsletter bodies: a contentEditable
// surface with a formatting toolbar, plus an HTML source view for hand-tuning. Internal-tool
// grade on purpose (uses document.execCommand — deprecated but universally supported).
import React, { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link2,
  Unlink,
  RemoveFormatting,
  Code,
} from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  minHeight?: number;
}

export function RichTextEditor({ value, onChange, minHeight = 220 }: RichTextEditorProps) {
  const [mode, setMode] = useState<'visual' | 'html'>('visual');
  const surfaceRef = useRef<HTMLDivElement>(null);
  // Tracks the last HTML we emitted so external value updates (template load, edit mode) sync the
  // surface without fighting the caret on every keystroke.
  const lastEmitted = useRef<string>('');

  useEffect(() => {
    const el = surfaceRef.current;
    if (mode === 'visual' && el && value !== lastEmitted.current && el.innerHTML !== value) {
      el.innerHTML = value;
      lastEmitted.current = value;
    }
  }, [value, mode]);

  function emit() {
    const el = surfaceRef.current;
    if (!el) return;
    lastEmitted.current = el.innerHTML;
    onChange(el.innerHTML);
  }

  function exec(command: string, arg?: string) {
    surfaceRef.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  }

  function insertLink() {
    const url = window.prompt('Link URL (https://…):');
    if (!url) return;
    exec('createLink', url);
  }

  const tools: { icon: React.ReactNode; label: string; run: () => void }[] = [
    { icon: <Bold size={14} />, label: 'Bold', run: () => exec('bold') },
    { icon: <Italic size={14} />, label: 'Italic', run: () => exec('italic') },
    { icon: <Underline size={14} />, label: 'Underline', run: () => exec('underline') },
    { icon: <Heading2 size={14} />, label: 'Heading', run: () => exec('formatBlock', '<h2>') },
    { icon: <Heading3 size={14} />, label: 'Subheading', run: () => exec('formatBlock', '<h3>') },
    { icon: <List size={14} />, label: 'Bullet list', run: () => exec('insertUnorderedList') },
    { icon: <ListOrdered size={14} />, label: 'Numbered list', run: () => exec('insertOrderedList') },
    { icon: <Link2 size={14} />, label: 'Link', run: insertLink },
    { icon: <Unlink size={14} />, label: 'Remove link', run: () => exec('unlink') },
    { icon: <RemoveFormatting size={14} />, label: 'Clear formatting', run: () => exec('removeFormat') },
  ];

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-primary)' }}>
      <div
        className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b"
        style={{ borderColor: 'var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}
      >
        {tools.map((tool) => (
          <button
            key={tool.label}
            type="button"
            title={tool.label}
            aria-label={tool.label}
            // preventDefault on mousedown keeps the text selection so the command applies to it.
            onMouseDown={(e) => e.preventDefault()}
            onClick={tool.run}
            disabled={mode === 'html'}
            className="p-1.5 rounded hover:opacity-70 disabled:opacity-30"
            style={{ color: 'var(--text-secondary)' }}
          >
            {tool.icon}
          </button>
        ))}
        <span className="flex-1" />
        <button
          type="button"
          title="Toggle HTML source"
          onClick={() => setMode((m) => (m === 'visual' ? 'html' : 'visual'))}
          className="p-1.5 rounded inline-flex items-center gap-1 text-xs font-medium hover:opacity-70"
          style={{ color: mode === 'html' ? 'var(--brand-primary)' : 'var(--text-secondary)' }}
        >
          <Code size={14} /> HTML
        </button>
      </div>

      {mode === 'visual' ? (
        <div
          ref={surfaceRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          className="px-3 py-2 text-sm outline-none overflow-y-auto rte-surface"
          style={{ minHeight, maxHeight: 480, backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }}
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => {
            lastEmitted.current = e.target.value;
            onChange(e.target.value);
          }}
          className="w-full px-3 py-2 text-xs font-mono outline-none"
          style={{ minHeight, backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: 'none' }}
        />
      )}
    </div>
  );
}
