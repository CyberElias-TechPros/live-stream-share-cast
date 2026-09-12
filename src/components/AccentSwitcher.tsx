import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Palette, Check } from "lucide-react";
import { ACCENTS, useAccent, type AccentId } from "@/hooks/useAccent";
import { ambientAudio } from "@/lib/ambientAudio";

function Swatch({ id, active }: { id: AccentId; active: boolean }) {
  const accent = ACCENTS.find((a) => a.id === id)!;
  return (
    <span
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
        active ? "ring-2 ring-white/70 ring-offset-2 ring-offset-[hsl(252_36%_6%)]" : "ring-1 ring-white/20"
      }`}
      style={{ background: accent.swatch }}
      aria-hidden
    >
      {active && <Check className="h-3 w-3 text-white drop-shadow" />}
    </span>
  );
}

/**
 * AccentSwitcher — swap the signature hue (Magenta / Aurora / Ember).
 * `variant="menu"` for the desktop nav, `variant="row"` for the mobile sheet.
 */
export default function AccentSwitcher({ variant = "menu" }: { variant?: "menu" | "row" }) {
  const [accent, setAccent] = useAccent();

  const choose = (id: AccentId) => {
    setAccent(id);
    if (ambientAudio.enabled) ambientAudio.blip("toggle");
  };

  if (variant === "row") {
    return (
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <p className="overline mb-3">Signature hue</p>
        <div className="space-y-2">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => choose(a.id)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                accent === a.id
                  ? "border-white/25 bg-white/[0.07]"
                  : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"
              }`}
            >
              <Swatch id={a.id} active={accent === a.id} />
              <span className="flex-1">
                <span className="block text-sm font-medium">{a.label}</span>
                <span className="block text-[11px] text-muted-foreground">{a.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Signature hue"
          title="Signature hue"
          className="relative grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground transition-all hover:text-foreground hover:bg-white/[0.06]"
        >
          <Palette className="h-4 w-4" />
          <span
            className="absolute -bottom-1 left-1/2 h-1.5 w-4 -translate-x-1/2 rounded-full"
            style={{ background: ACCENTS.find((a) => a.id === accent)!.swatch }}
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-2xl glass-deep">
        <DropdownMenuLabel className="font-mono text-[10px] tracking-[0.25em] uppercase">
          Signature hue
        </DropdownMenuLabel>
        {ACCENTS.map((a) => (
          <DropdownMenuItem
            key={a.id}
            className="flex items-center gap-3 rounded-xl py-2.5 cursor-pointer"
            onClick={() => choose(a.id)}
          >
            <Swatch id={a.id} active={accent === a.id} />
            <span className="flex-1">
              <span className="block text-sm font-medium">{a.label}</span>
              <span className="block text-[11px] text-muted-foreground">{a.desc}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
