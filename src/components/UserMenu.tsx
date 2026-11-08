import { useRef } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  /** Account holder's name; the trigger reads "Menu" without one. */
  name: string | null;
};

export function UserMenu({ name }: Props) {
  const logout = useRef<HTMLFormElement>(null);
  return (
    <>
      <form ref={logout} method="post" action="/api/logout" hidden />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="lg"
            className="rounded-full bg-card px-4 shadow-md ring-1 ring-foreground/5 transition-shadow hover:bg-card hover:shadow-lg aria-expanded:bg-card aria-expanded:shadow-lg"
          >
            {name ?? "Menu"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem onSelect={() => logout.current?.requestSubmit()}>
            <LogOut aria-hidden="true" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
