import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import type { Setting } from "@/lib/cozytouch.ts";

type Props = {
  deviceId: string;
  value: number;
  size: "default" | "small";
  setting: Setting;
  label: string;
  min?: number | null;
  max?: number | null;
};

// Markup for TemperatureStepper.astro, which owns the script
export function TemperatureStepperView({
  deviceId,
  value,
  size,
  setting,
  label,
  min,
  max,
}: Props) {
  const small = size === "small";
  const button = small ? "icon-sm" : "icon-lg";
  return (
    <ButtonGroup
      className="text-foreground"
      data-stepper=""
      data-device={deviceId}
      data-setting={setting}
      data-value={value}
      data-min={min ?? undefined}
      data-max={max ?? undefined}
    >
      <Button variant="outline" size={button} data-step="-0.5" aria-label="Lower">
        <Minus aria-hidden="true" />
      </Button>
      <InputGroup className={`${small ? "h-7 w-20" : "h-9 w-24"} bg-card`}>
        <InputGroupInput
          type="number"
          inputMode="decimal"
          step={0.5}
          min={min ?? undefined}
          max={max ?? undefined}
          defaultValue={value.toFixed(1)}
          aria-label={label}
          className="h-full text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <InputGroupAddon align="inline-end" aria-hidden="true">
          <InputGroupText>°C</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      <Button variant="outline" size={button} data-step="0.5" aria-label="Raise">
        <Plus aria-hidden="true" />
      </Button>
    </ButtonGroup>
  );
}
