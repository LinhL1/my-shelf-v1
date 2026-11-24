import { useEffect, useRef, useState } from 'react';

/** Accepts files dropped anywhere on the window. Returns whether files are being dragged over it. */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const handler = useRef(onFiles);
  useEffect(() => {
    handler.current = onFiles;
  });

  useEffect(() => {
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;

    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer!.dropEffect = 'copy';
      setDragging(true);
    };
    const onDragLeave = (event: DragEvent) => {
      // relatedTarget is null only when the pointer leaves the window itself.
      if (event.relatedTarget === null) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragging(false);
      handler.current([...event.dataTransfer!.files]);
    };

    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  return dragging;
}
