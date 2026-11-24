import { useEffect, useRef, useState } from 'react';
import type { Book } from '../types';
import { MoreIcon } from '../ui/icons';

export type BookAction = 'open' | 'edit' | 'download' | 'remove';

const ACTIONS: { id: BookAction; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'edit', label: 'Edit details' },
  { id: 'download', label: 'Download PDF' },
  { id: 'remove', label: 'Remove' },
];

interface BookMenuProps {
  book: Book;
  onAction: (action: BookAction) => void;
}

export function BookMenu({ book, onAction }: BookMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) return;
    if (event.key === 'Escape') {
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = [...root.current!.querySelectorAll<HTMLElement>('[role=menuitem]')];
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const index = items.indexOf(document.activeElement as HTMLElement);
      items.at((index + step) % items.length)?.focus();
    }
  };

  return (
    <div
      ref={root}
      className="absolute -top-1 -right-2"
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={`book-menu-trigger icon-button size-7 ${open ? 'is-open' : ''}`}
        aria-label={`Options for ${book.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreIcon className="size-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-line bg-white py-1 shadow-lg shadow-black/5"
        >
          {ACTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              className={`block w-full px-3 py-1.5 text-left text-sm outline-none hover:bg-paper focus-visible:bg-paper ${
                id === 'remove' ? 'text-danger' : 'text-ink'
              }`}
              onClick={() => {
                setOpen(false);
                onAction(id);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
