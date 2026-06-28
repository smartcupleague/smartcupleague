import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import './filter-select.css';

export type FilterSelectOption<TValue extends string = string> = {
  value: TValue;
  label: string;
};

type FilterSelectProps<TValue extends string = string> = {
  ariaLabel: string;
  value: TValue;
  options: FilterSelectOption<TValue>[];
  onChange: (value: TValue) => void;
};

export function FilterSelect<TValue extends string = string>({
  ariaLabel,
  value,
  options,
  onChange,
}: FilterSelectProps<TValue>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    requestAnimationFrame(() => {
      optionRefs.current[selectedIndex]?.focus();
    });
  }, [open, selectedIndex]);

  const closeAndReturnFocus = () => {
    setOpen(false);
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
    }
  };

  const focusOption = (index: number) => {
    const boundedIndex = (index + options.length) % options.length;
    optionRefs.current[boundedIndex]?.focus();
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAndReturnFocus();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusOption(index + 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusOption(index - 1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      focusOption(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      focusOption(options.length - 1);
    }
  };

  return (
    <span className={`filterSelect ${open ? 'is-open' : ''}`} ref={rootRef}>
      <button
        className="filterSelect__trigger"
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={ariaLabel}>
        <span>{selected?.label ?? ''}</span>
        <span className="filterSelect__chevron" aria-hidden="true">⌄</span>
      </button>

      {open ? (
        <div className="filterSelect__menu" id={menuId} role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => {
            const optionSelected = option.value === value;
            return (
              <button
                className={optionSelected ? 'is-selected' : ''}
                key={option.value}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                role="option"
                aria-selected={optionSelected}
                onClick={() => {
                  onChange(option.value);
                  closeAndReturnFocus();
                }}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}>
                <span className="filterSelect__mark" aria-hidden="true">{optionSelected ? '✓' : ''}</span>
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </span>
  );
}
