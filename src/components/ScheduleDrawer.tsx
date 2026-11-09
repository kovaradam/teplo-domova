import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
import { useInertPage } from "@/components/useInertPage";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  DAY,
  STEP,
  toTime,
  type ScheduleEditRequest,
} from "@/utils/schedule.ts";

const display = (m: number) => (m === DAY ? "24:00" : toTime(m));
const steps = (from: number, to: number) =>
  Array.from(
    { length: Math.max(0, Math.floor((to - from) / STEP) + 1) },
    (_, i) => from + i * STEP,
  );
// A whole-day period would read as an empty slot on the heater
const wholeDay = (start: number, end: number) => start === 0 && end === DAY;

/** Edits one comfort period on touch screens, opened by the week schedule's `schedule-edit` event. */
export function ScheduleDrawer() {
  const [request, setRequest] = useState<ScheduleEditRequest | null>(null);
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  // Opened from script, so there's no trigger for Radix to return focus to
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onEdit = (event: Event) => {
      const next = (event as CustomEvent<ScheduleEditRequest>).detail;
      returnFocus.current =
        document.activeElement instanceof HTMLElement &&
        document.activeElement !== document.body
          ? document.activeElement
          : null;
      setRequest(next);
      setStart(next.start);
      setEnd(next.end);
      setOpen(true);
    };
    document.addEventListener("schedule-edit", onEdit);
    return () => document.removeEventListener("schedule-edit", onEdit);
  }, []);

  useInertPage(open);

  const low = request?.low ?? 0;
  const high = request?.high ?? DAY;
  const starts = steps(low, high - STEP);
  const ends = steps(start + STEP, high).filter((e) => !wholeDay(start, e));

  const changeStart = (next: number) => {
    setStart(next);
    if (end <= next || wholeDay(next, end))
      setEnd(Math.min(next + STEP, wholeDay(next, high) ? DAY - STEP : high));
  };
  const finish = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <Drawer open={open} onOpenChange={setOpen} autoFocus>
      <DrawerContent
        onCloseAutoFocus={(event) => {
          if (!returnFocus.current?.isConnected) return;
          event.preventDefault();
          returnFocus.current.focus();
        }}
      >
        <div className="mx-auto w-full max-w-sm">
          <DrawerHeader>
            <DrawerTitle>Update comfort period</DrawerTitle>
            <DrawerDescription>
              {request?.day}, {display(start)}–{display(end)}
            </DrawerDescription>
          </DrawerHeader>
          <div className="grid grid-cols-2 gap-4 px-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="period-start">Start</Label>
              <NativeSelect
                className="w-full [&_select]:h-10"
                id="period-start"
                value={start}
                onChange={(e) => changeStart(Number(e.target.value))}
              >
                {starts.map((m) => (
                  <NativeSelectOption key={m} value={m}>
                    {display(m)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="period-end">End</Label>
              <NativeSelect
                className="w-full [&_select]:h-10"
                id="period-end"
                value={end}
                onChange={(e) => setEnd(Number(e.target.value))}
              >
                {ends.map((m) => (
                  <NativeSelectOption key={m} value={m}>
                    {display(m)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          <DrawerFooter>
            <Button size="lg" onClick={() => finish(() => request?.save(start, end))}>
              Save
            </Button>
            <Button
              size="lg"
              variant="destructive"
              onClick={() => finish(() => request?.remove())}
            >
              Delete period
            </Button>
            <DrawerClose asChild>
              <Button size="lg" variant="outline" className="sr-only">
                Cancel
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
