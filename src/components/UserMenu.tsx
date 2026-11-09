import { useRef, useState, useSyncExternalStore } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useInertPage } from "@/components/useInertPage";

type Props = {
  /** Account holder's name; the trigger reads "Menu" without one. */
  name: string | null;
};

// Matches Tailwind's max-sm, where the trigger floats in the bottom right
const SMALL = "(max-width: 639px)";
const subscribe = (change: () => void) => {
  const query = matchMedia(SMALL);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};

/** Account menu: a dropdown under the header trigger, or a drawer on small screens. */
export function UserMenu({ name }: Props) {
  const logout = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  // The server renders the dropdown; small screens swap to the drawer after hydration
  const small = useSyncExternalStore(
    subscribe,
    () => matchMedia(SMALL).matches,
    () => false,
  );
  useInertPage(small && open);
  const logOut = () => logout.current?.requestSubmit();

  const trigger = (
    <Button
      variant="ghost"
      size="lg"
      className="rounded-full bg-card px-4 shadow-md ring-1 ring-foreground/5 transition-shadow hover:bg-card hover:shadow-lg aria-expanded:bg-card aria-expanded:shadow-lg"
    >
      {name ?? "Menu"}
    </Button>
  );

  return (
    <>
      <form ref={logout} method="post" action="/api/logout" hidden />
      {small ? (
        <Drawer open={open} onOpenChange={setOpen} autoFocus>
          <DrawerTrigger asChild>{trigger}</DrawerTrigger>
          <DrawerContent>
            <div className="mx-auto w-full max-w-sm">
              <DrawerHeader>
                <DrawerTitle>{name ?? "Menu"}</DrawerTitle>
              </DrawerHeader>
              <DrawerFooter>
                <Button size="lg" className="h-10" onClick={logOut}>
                  <LogOut aria-hidden="true" />
                  Log out
                </Button>
                <DrawerClose asChild>
                  <Button variant="outline" size="lg" className="h-10">
                    Cancel
                  </Button>
                </DrawerClose>
              </DrawerFooter>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem onSelect={logOut}>
              <LogOut aria-hidden="true" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}
