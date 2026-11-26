import { useId, useState } from 'react';
import { StarIcon } from '../ui/icons';

const STARS = [1, 2, 3, 4, 5] as const;

interface StarRatingProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

/**
 * Five stars built on radio buttons, so arrow keys move between them. Choosing the rating that
 * is already set clears it.
 */
export function StarRating({ value, onChange }: StarRatingProps) {
  const name = useId();
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? value ?? 0;

  return (
    <fieldset>
      <legend className="text-xs text-muted">Rating</legend>
      <div className="mt-1 flex items-center gap-3">
        <div className="flex" onPointerLeave={() => setHovered(null)}>
          {STARS.map((stars) => (
            <label
              key={stars}
              className="star"
              data-filled={stars <= shown}
              onPointerEnter={(event) => event.pointerType === 'mouse' && setHovered(stars)}
            >
              <input
                type="radio"
                className="sr-only"
                name={name}
                value={stars}
                aria-label={`${stars} ${stars === 1 ? 'star' : 'stars'}`}
                checked={value === stars}
                onChange={() => onChange(stars)}
                // A checked radio fires no change event when clicked again.
                onClick={() => value === stars && onChange(null)}
              />
              <StarIcon className="size-6" />
            </label>
          ))}
        </div>
        {value !== null && (
          <button
            type="button"
            className="text-xs text-muted transition-colors hover:text-ink"
            onClick={() => onChange(null)}
          >
            Clear rating
          </button>
        )}
      </div>
    </fieldset>
  );
}
