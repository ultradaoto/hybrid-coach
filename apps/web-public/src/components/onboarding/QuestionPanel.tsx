/**
 * Question Panel Component
 * 
 * Left side panel with welcome header (first step), question, and input.
 */

import { useState, type KeyboardEvent } from 'react';
import { StarRating } from './StarRating';

interface QuestionPanelProps {
  firstName: string;
  question: string;
  placeholder?: string;
  inputType: 'textarea' | 'stars';
  value: string | number;
  onChange: (value: string | number) => void;
  onSubmit: () => void;
  isLastStep: boolean;
  isFirstStep: boolean;
  isSubmitting?: boolean;
}

export function QuestionPanel({
  firstName,
  question,
  placeholder,
  inputType,
  value,
  onChange,
  onSubmit,
  isLastStep,
  isFirstStep,
  isSubmitting = false,
}: QuestionPanelProps) {
  const [isFocused, setIsFocused] = useState(false);
  
  const isValid = inputType === 'stars' 
    ? typeof value === 'number' && value >= 1 
    : typeof value === 'string' && value.trim().length > 0;

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift for newline)
    if (e.key === 'Enter' && !e.shiftKey && isValid && !isSubmitting) {
      e.preventDefault();
      onSubmit();
    }
  };

  const handleButtonClick = () => {
    if (isValid && !isSubmitting) {
      onSubmit();
    }
  };

  return (
    <div className="question-panel">
      {/* Welcome header - only on first step */}
      {isFirstStep && (
        <div className="question-panel-welcome">
          <h1 className="question-panel-title">
            Welcome, <span className="question-panel-name">{firstName}</span>, to MyUltra.Coach
          </h1>
          <p className="question-panel-subtitle">
            We have a few short onboarding questions to help you get the most out of your next coaching session.
            <br />
            <span className="question-panel-highlight">
              You could be speaking with the Ultra Coach within minutes!
            </span>
          </p>
        </div>
      )}

      {/* Question */}
      <div className="question-panel-question">
        <p>{question}</p>
      </div>

      {/* Input area */}
      <div className="question-panel-input">
        {inputType === 'textarea' ? (
          <div className={`question-panel-textarea-wrapper ${isFocused ? 'focused' : ''}`}>
            <textarea
              value={value as string}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={placeholder}
              rows={4}
              className="question-panel-textarea"
              disabled={isSubmitting}
            />
            <div className="question-panel-hint">
              Press <kbd>Enter</kbd> to continue
            </div>
          </div>
        ) : (
          <StarRating 
            value={value as number} 
            onChange={(v) => onChange(v)} 
          />
        )}
      </div>

      {/* Submit button */}
      <button
        onClick={handleButtonClick}
        disabled={!isValid || isSubmitting}
        className={`question-panel-button ${isValid && !isSubmitting ? 'active' : 'disabled'}`}
        type="button"
      >
        {isSubmitting ? 'Submitting...' : isLastStep ? 'Submit Onboarding' : 'Next Question'}
      </button>
    </div>
  );
}
