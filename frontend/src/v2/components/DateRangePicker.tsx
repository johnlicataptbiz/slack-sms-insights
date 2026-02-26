import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════════
// Issue #18: Date Range Picker Component
// ═══════════════════════════════════════════════════════════════════════════════

type PresetRange = 'today' | '7d' | '14d' | '30d' | '90d' | 'mtd' | 'ytd' | 'custom';

interface DateRangePickerProps {
  from: Date;
  to: Date;
  onChange: (from: Date, to: Date) => void;
  presets?: PresetRange[];
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
}

const PRESET_LABELS: Record<PresetRange, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '14d': 'Last 14 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  mtd: 'Month to date',
  ytd: 'Year to date',
  custom: 'Custom range',
};

export function DateRangePicker({
  from,
  to,
  onChange,
  presets = ['today', '7d', '14d', '30d', 'mtd', 'custom'],
  minDate,
  maxDate,
  disabled = false,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<PresetRange | null>(null);
  const [customFrom, setCustomFrom] = useState(formatDate(from));
  const [customTo, setCustomTo] = useState(formatDate(to));

  const detectActivePreset = useMemo((): PresetRange | null => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (isSameDay(from, startOfToday) && isSameDay(to, now)) return 'today';
    if (isSameDay(from, subDays(now, 7)) && isSameDay(to, now)) return '7d';
    if (isSameDay(from, subDays(now, 14)) && isSameDay(to, now)) return '14d';
    if (isSameDay(from, subDays(now, 30)) && isSameDay(to, now)) return '30d';
    if (isSameDay(from, subDays(now, 90)) && isSameDay(to, now)) return '90d';
    if (isSameDay(from, startOfMonth(now)) && isSameDay(to, now)) return 'mtd';
    if (isSameDay(from, startOfYear(now)) && isSameDay(to, now)) return 'ytd';

    return 'custom';
  }, [from, to]);

  const handlePresetClick = useCallback(
    (preset: PresetRange) => {
      const now = new Date();
      let newFrom: Date;
      let newTo: Date = now;

      switch (preset) {
        case 'today':
          newFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case '7d':
          newFrom = subDays(now, 7);
          break;
        case '14d':
          newFrom = subDays(now, 14);
          break;
        case '30d':
          newFrom = subDays(now, 30);
          break;
        case '90d':
          newFrom = subDays(now, 90);
          break;
        case 'mtd':
          newFrom = startOfMonth(now);
          break;
        case 'ytd':
          newFrom = startOfYear(now);
          break;
        case 'custom':
          setActivePreset('custom');
          return;
        default:
          return;
      }

      setActivePreset(preset);
      onChange(newFrom, newTo);
      setIsOpen(false);
    },
    [onChange]
  );

  const handleCustomApply = useCallback(() => {
    const newFrom = new Date(customFrom);
    const newTo = new Date(customTo);

    if (!isNaN(newFrom.getTime()) && !isNaN(newTo.getTime()) && newFrom <= newTo) {
      // Ensure we include the full day
      newTo.setHours(23, 59, 59, 999);
      onChange(newFrom, newTo);
      setActivePreset('custom');
      setIsOpen(false);
    }
  }, [customFrom, customTo, onChange]);

  return (
    <div className="V2DateRangePicker">
      <button
        type="button"
        className="V2DateRangePicker__trigger"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className="V2DateRangePicker__label">
          {detectActivePreset && detectActivePreset !== 'custom'
            ? PRESET_LABELS[detectActivePreset]
            : `${formatDisplayDate(from)} - ${formatDisplayDate(to)}`}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="6,9 12,15 18,9" />
        </svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="V2DateRangePicker__dropdown"
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            role="dialog"
            aria-label="Select date range"
          >
            <div className="V2DateRangePicker__presets">
              {presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`V2DateRangePicker__preset ${
                    (activePreset || detectActivePreset) === preset
                      ? 'V2DateRangePicker__preset--active'
                      : ''
                  }`}
                  onClick={() => handlePresetClick(preset)}
                >
                  {PRESET_LABELS[preset]}
                </button>
              ))}
            </div>

            {(activePreset === 'custom' || presets.includes('custom')) && (
              <div className="V2DateRangePicker__custom">
                <div className="V2DateRangePicker__inputs">
                  <div className="V2DateRangePicker__field">
                    <label htmlFor="drp-from">From</label>
                    <input
                      id="drp-from"
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      min={minDate ? formatDate(minDate) : undefined}
                      max={customTo}
                    />
                  </div>
                  <div className="V2DateRangePicker__field">
                    <label htmlFor="drp-to">To</label>
                    <input
                      id="drp-to"
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      min={customFrom}
                      max={maxDate ? formatDate(maxDate) : formatDate(new Date())}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="V2DateRangePicker__apply"
                  onClick={handleCustomApply}
                >
                  Apply
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Utility functions
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function subDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

export default DateRangePicker;
