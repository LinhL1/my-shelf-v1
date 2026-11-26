import { useId, useRef } from 'react';
import { addTags, removeTag, suggestTags } from '../lib/tags';
import { CloseIcon, PlusIcon } from '../ui/icons';

interface TagFieldProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  /** Text typed but not yet turned into a tag; saving the form should include it. */
  draft: string;
  onDraftChange: (draft: string) => void;
  /** Tags used anywhere in the library, offered as suggestions. */
  known: string[];
}

const MAX_SUGGESTIONS = 8;

/** Chips for the chosen tags, followed by a text field. Enter or a comma adds what is typed. */
export function TagField({ tags, onTagsChange, draft, onDraftChange, known }: TagFieldProps) {
  const labelId = useId();
  const input = useRef<HTMLInputElement>(null);
  const suggestions = suggestTags(known, tags, draft).slice(0, MAX_SUGGESTIONS);

  const add = (text: string) => onTagsChange(addTags(tags, text, known));

  return (
    <div>
      <span id={labelId} className="text-xs text-muted">
        Tags
      </span>
      <div
        className="field tag-field mt-1 flex h-auto min-h-9 cursor-text flex-wrap items-center gap-1.5 py-1.5"
        onPointerDown={(event) => {
          // Clicks on the empty part of the box go to the text field.
          if (event.target === event.currentTarget) {
            event.preventDefault();
            input.current?.focus();
          }
        }}
      >
        {tags.map((tag) => (
          <span key={tag} className="tag-chip is-chosen">
            {tag}
            <button
              type="button"
              className="tag-chip-remove"
              aria-label={`Remove tag ${tag}`}
              onClick={() => onTagsChange(removeTag(tags, tag))}
            >
              <CloseIcon className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={input}
          className="min-w-24 flex-1 bg-transparent outline-none placeholder:text-muted"
          aria-labelledby={labelId}
          placeholder={tags.length ? '' : 'TBR, Fiction, Tech…'}
          value={draft}
          onChange={(event) => {
            const value = event.target.value;
            // A comma finishes the tag before it.
            const end = value.lastIndexOf(',');
            if (end === -1) return onDraftChange(value);
            add(value.slice(0, end));
            onDraftChange(value.slice(end + 1).trimStart());
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && draft.trim()) {
              // Adds the tag instead of submitting the form.
              event.preventDefault();
              add(draft);
              onDraftChange('');
            } else if (event.key === 'Backspace' && !draft && tags.length) {
              onTagsChange(tags.slice(0, -1));
            }
          }}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Suggested tags">
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              className="tag-chip is-suggested"
              aria-label={`Add tag ${tag}`}
              onClick={() => {
                add(tag);
                onDraftChange('');
                input.current?.focus();
              }}
            >
              <PlusIcon className="size-3" />
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
