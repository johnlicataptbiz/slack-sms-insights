import * as Select from "@radix-ui/react-select";
import { CheckIcon, ChevronDownIcon } from "@radix-ui/react-icons";
import { cn } from "../../lib/utils";

export type V2SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type V2SelectProps = {
  value?: string;
  onValueChange: (value: string) => void;
  options: V2SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  triggerClassName?: string;
  contentClassName?: string;
  disabled?: boolean;
};

export function V2Select({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  ariaLabel,
  triggerClassName,
  contentClassName,
  disabled = false,
}: V2SelectProps) {
  const resolvedValue = value && value.length > 0 ? value : null;

  return (
    <Select.Root
      {...(resolvedValue ? { value: resolvedValue } : {})}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <Select.Trigger
        className={cn("V2Select__trigger tw-field tw-focus-ring", triggerClassName)}
        aria-label={ariaLabel}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon className="V2Select__icon" aria-hidden>
          <ChevronDownIcon />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className={cn("V2Select__content tw-surface", contentClassName)}
          position="popper"
          sideOffset={6}
        >
          <Select.Viewport className="V2Select__viewport">
            {options.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                {...(option.disabled ? { disabled: true } : {})}
                className="V2Select__item"
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="V2Select__itemIndicator">
                  <CheckIcon />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
