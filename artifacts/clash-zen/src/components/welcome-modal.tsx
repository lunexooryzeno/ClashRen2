import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Trophy, Swords, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WelcomeModalProps {
  open: boolean;
  playerName: string;
  onContinue: () => void;
}

export function WelcomeModal({ open, playerName, onContinue }: WelcomeModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={() => {}}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className={cn(
            "fixed left-[50%] top-[50%] z-50 w-full max-w-sm translate-x-[-50%] translate-y-[-50%]",
            "rounded-2xl border border-white/10 bg-[#0e0b1f] overflow-hidden",
            "shadow-[0_0_60px_rgba(139,92,246,0.3)]",
            "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
            "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
          )}
        >
          <DialogPrimitive.Title className="sr-only">Welcome to Clash Ren</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Your profile is set up. You can now join tournaments and compete.</DialogPrimitive.Description>
          <div className="relative flex flex-col items-center text-center px-8 pt-10 pb-8 gap-6">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] bg-primary/15 rounded-full blur-[80px]" />
            </div>

            <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-primary/20 border border-primary/30">
              <Trophy className="w-10 h-10 text-primary" strokeWidth={1.5} />
              <Star className="absolute -top-1 -right-1 w-5 h-5 text-yellow-400 fill-yellow-400" />
            </div>

            <div className="relative space-y-2">
              <h2 className="font-heading text-2xl font-bold tracking-tight text-white leading-tight">
                Welcome to Clash Ren,<br />
                <span className="text-primary">{playerName}!</span>
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You're all set. Discover tournaments, register your squad, and compete for prizes — all in one place.
              </p>
            </div>

            <div className="relative w-full grid grid-cols-3 gap-3">
              {[
                { icon: Swords, label: "Join Tournaments" },
                { icon: Trophy, label: "Win Prizes" },
                { icon: Star, label: "Top the Ranks" },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-2 rounded-xl bg-white/5 border border-white/10 p-3"
                >
                  <Icon className="w-5 h-5 text-primary" strokeWidth={1.5} />
                  <span className="text-[10px] text-white/70 font-medium leading-tight">{label}</span>
                </div>
              ))}
            </div>

            <Button
              className="relative w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-base shadow-[0_0_20px_rgba(139,92,246,0.5)] transition-all active:scale-95"
              onClick={onContinue}
              data-testid="button-welcome-continue"
            >
              Let's Go!
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
