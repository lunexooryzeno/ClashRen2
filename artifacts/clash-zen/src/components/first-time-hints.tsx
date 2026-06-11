import { useState, useEffect } from "react";
import { Link } from "wouter";
import { X, Calendar, User, Gem, ChevronRight } from "lucide-react";

const getHintsDismissedKey = (userId: number) => `clash-ren:hints-dismissed:${userId}`;

interface FirstTimeHintsProps {
  userId: number;
}

const STEPS = [
  {
    icon: Calendar,
    label: "Browse upcoming tournaments",
    description: "Find events to join and compete in",
    href: "/matches",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
  },
  {
    icon: User,
    label: "Complete your profile",
    description: "Add your in-game details and avatar",
    href: "/profile",
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    border: "border-blue-400/20",
  },
  {
    icon: Gem,
    label: "Top up your diamonds",
    description: "Get diamonds to enter paid tournaments",
    href: "/top-up",
    color: "text-diamond",
    bg: "bg-yellow-400/10",
    border: "border-yellow-400/20",
  },
];

export function FirstTimeHints({ userId }: FirstTimeHintsProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(getHintsDismissedKey(userId)) === "true";
    setVisible(!dismissed);
  }, [userId]);

  function dismiss() {
    localStorage.setItem(getHintsDismissedKey(userId), "true");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="mx-4 mb-6 rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden" data-testid="first-time-hints">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <p className="text-xs text-primary uppercase tracking-wider font-bold">Getting Started</p>
          <h3 className="font-heading text-base font-bold text-white mt-0.5">Your next steps</h3>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss getting started checklist"
          className="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 text-muted-foreground hover:text-white hover:bg-white/10 transition-colors"
          data-testid="button-dismiss-hints"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-3 pb-3 flex flex-col gap-1.5">
        {STEPS.map(({ icon: Icon, label, description, href, color, bg, border }) => (
          <Link key={href} href={href} onClick={dismiss}>
            <div
              className={`flex items-center gap-3 rounded-xl border ${border} ${bg} px-3 py-2.5 hover:bg-white/[0.06] transition-colors cursor-pointer`}
              data-testid={`hint-item-${href.replace("/", "")}`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 shrink-0`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white leading-tight">{label}</p>
                <p className="text-xs text-muted-foreground leading-tight mt-0.5">{description}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
