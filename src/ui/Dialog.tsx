import { useEffect, useId, useRef, type ReactNode } from 'react';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A modal built on the native dialog element, which handles focus trapping and Escape. */
export function Dialog({ title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        // The dialog's own box is fully covered by its content, so this is the backdrop.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="p-6">
        <h2 id={titleId} className="font-serif text-lg text-ink">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
