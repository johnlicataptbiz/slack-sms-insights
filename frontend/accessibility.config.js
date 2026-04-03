import { useEffect } from 'react';

// Keyboard navigation utility
export function useKeyboardNavigation(
  ref: React.RefObject<HTMLElement>, 
  options: {
    trapFocus?: boolean;
    escapeToClose?: boolean;
    onEscape?: () => void;
  } = {}
) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Trap focus within the element
      if (options.trapFocus && event.key === 'Tab') {
        const focusableElements = element.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) as NodeListOf<HTMLElement>;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }

      // Escape to close
      if (options.escapeToClose && event.key === 'Escape') {
        options.onEscape?.();
      }
    };

    element.addEventListener('keydown', handleKeyDown);
    return () => {
      element.removeEventListener('keydown', handleKeyDown);
    };
  }, [ref, options]);
}

// ARIA attribute generators
export function generateAriaAttributes(
  type: 'button' | 'input' | 'dialog' | 'menu',
  customProps: Record<string, string> = {}
) {
  const baseAttributes: Record<string, string> = {
    button: {
      'aria-label': 'Click to activate',
      ...customProps
    },
    input: {
      'aria-required': 'false',
      'aria-invalid': 'false',
      ...customProps
    },
    dialog: {
      'aria-modal': 'true',
      'role': 'dialog',
      ...customProps
    },
    menu: {
      'role': 'menu',
      'aria-orientation': 'vertical',
      ...customProps
    }
  };

  return baseAttributes[type];
}

// Screen reader announcement utility
export function announceForScreenReader(message: string, politeness: 'polite' | 'assertive' = 'polite') {
  const announcementElement = document.createElement('div');
  announcementElement.setAttribute('role', 'status');
  announcementElement.setAttribute('aria-live', politeness);
  announcementElement.style.position = 'absolute';
  announcementElement.style.left = '-9999px';
  announcementElement.textContent = message;

  document.body.appendChild(announcementElement);

  // Remove the element after announcement
  setTimeout(() => {
    document.body.removeChild(announcementElement);
  }, 5000);
}

// Color contrast utility
export function checkColorContrast(foreground: string, background: string): number {
  const getLuminance = (color: string) => {
    const rgb = parseInt(color.slice(1), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >>  8) & 0xff;
    const b = (rgb >>  0) & 0xff;

    const a = [r, g, b].map(v => {
      v /= 255;
      return v <= 0.03928 
        ? v / 12.92 
        : Math.pow((v + 0.055) / 1.055, 2.4);
    });

    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  };

  const l1 = getLuminance(foreground);
  const l2 = getLuminance(background);

  const contrast = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return Number(contrast.toFixed(2));
}