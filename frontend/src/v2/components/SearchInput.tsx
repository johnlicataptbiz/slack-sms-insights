import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDebounce } from '../hooks/useDebounce';

// ═══════════════════════════════════════════════════════════════════════════════
// Issue #19: Search Input Component
// ═══════════════════════════════════════════════════════════════════════════════

interface SearchInputProps {
  value?: string;
  onChange: (value: string) => void;
  onSearch?: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  showClearButton?: boolean;
  suggestions?: string[];
  onSuggestionSelect?: (suggestion: string) => void;
  isLoading?: boolean;
  autoFocus?: boolean;
  'aria-label'?: string;
}

export function SearchInput({
  value: controlledValue,
  onChange,
  onSearch,
  placeholder = 'Search...',
  debounceMs = 300,
  showClearButton = true,
  suggestions = [],
  onSuggestionSelect,
  isLoading = false,
  autoFocus = false,
  'aria-label': ariaLabel = 'Search',
}: SearchInputProps) {
  const [internalValue, setInternalValue] = useState(controlledValue || '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLUListElement>(null);

  const value = controlledValue !== undefined ? controlledValue : internalValue;
  const debouncedValue = useDebounce(value, debounceMs);

  useEffect(() => {
    if (debouncedValue) {
      onSearch?.(debouncedValue);
    }
  }, [debouncedValue, onSearch]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInternalValue(newValue);
      onChange(newValue);
      setSelectedIndex(-1);
      setShowSuggestions(newValue.length > 0 && suggestions.length > 0);
    },
    [onChange, suggestions.length]
  );

  const handleClear = useCallback(() => {
    setInternalValue('');
    onChange('');
    onSearch?.('');
    inputRef.current?.focus();
  }, [onChange, onSearch]);

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      setInternalValue(suggestion);
      onChange(suggestion);
      onSuggestionSelect?.(suggestion);
      setShowSuggestions(false);
      inputRef.current?.focus();
    },
    [onChange, onSuggestionSelect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showSuggestions || suggestions.length === 0) {
        if (e.key === 'Enter') {
          onSearch?.(value);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
            const suggestion = suggestions[selectedIndex];
            if (suggestion !== undefined) {
              handleSuggestionClick(suggestion);
            }
          } else {
            onSearch?.(value);
          }
          setShowSuggestions(false);
          break;
        case 'Escape':
          setShowSuggestions(false);
          setSelectedIndex(-1);
          break;
      }
    },
    [showSuggestions, suggestions, selectedIndex, handleSuggestionClick, onSearch, value]
  );

  // Auto-scroll selected suggestion into view
  useEffect(() => {
    if (selectedIndex >= 0 && suggestionsRef.current) {
      const selectedElement = suggestionsRef.current.children[selectedIndex] as HTMLElement;
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  return (
    <div className="V2SearchInput" role="search">
      <div className="V2SearchInput__wrapper">
        <span className="V2SearchInput__icon" aria-hidden="true">
          {isLoading ? (
            <span className="V2SearchInput__spinner" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          )}
        </span>

        <input
          ref={inputRef}
          type="text"
          className="V2SearchInput__input"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(value.length > 0 && suggestions.length > 0)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          aria-expanded={showSuggestions}
          aria-autocomplete="list"
          aria-controls="search-suggestions"
          role="combobox"
        />

        {showClearButton && value && (
          <button
            type="button"
            className="V2SearchInput__clear"
            onClick={handleClear}
            aria-label="Clear search"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      <AnimatePresence>
        {showSuggestions && suggestions.length > 0 && (
          <motion.ul
            ref={suggestionsRef}
            id="search-suggestions"
            className="V2SearchInput__suggestions"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            role="listbox"
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion}
                className={`V2SearchInput__suggestion ${
                  index === selectedIndex ? 'V2SearchInput__suggestion--selected' : ''
                }`}
                onClick={() => handleSuggestionClick(suggestion)}
                role="option"
                aria-selected={index === selectedIndex}
              >
                {suggestion}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SearchInput;
