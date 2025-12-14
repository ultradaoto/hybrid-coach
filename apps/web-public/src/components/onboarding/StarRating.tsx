/**
 * Star Rating Component
 * 
 * 5-star mood selector with hover effects and mood labels.
 */

import { useState } from 'react';
import { MOOD_LABELS } from '../../types/onboarding';

interface StarRatingProps {
  value: number;
  onChange: (value: number) => void;
}

export function StarRating({ value, onChange }: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  
  const displayValue = hovered ?? value;
  const moodLabel = displayValue > 0 ? MOOD_LABELS[displayValue] : '';
  
  // Determine mood label color class
  const getMoodColorClass = () => {
    if (displayValue <= 2) return 'mood-poor';
    if (displayValue === 3) return 'mood-okay';
    return 'mood-great';
  };

  return (
    <div className="star-rating">
      <div className="star-rating-stars">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(null)}
            className={`star-rating-star ${star <= displayValue ? 'active' : ''}`}
            aria-label={`Rate ${star} out of 5`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="star-rating-icon"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>
        ))}
      </div>
      
      {/* Mood label */}
      <div className={`star-rating-label ${displayValue > 0 ? 'visible' : ''} ${getMoodColorClass()}`}>
        {moodLabel}
      </div>
    </div>
  );
}
