import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import {
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  RefreshCw,
  Info,
  Flame,
  ShieldCheck,
} from "lucide-react"

const DURATION = 4500 // ms — must match ToastProvider duration

function toastIcon(title?: React.ReactNode, variant?: string | null) {
  const t = String(title ?? "").toLowerCase()
  if (variant === "destructive" || t.includes("error") || t.includes("invalid") || t.includes("failed")) {
    return <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
  }
  if (t.includes("sent") && !t.includes("resent")) {
    return <MessageSquare className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
  }
  if (t.includes("resent")) {
    return <RefreshCw className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
  }
  if (t.includes("verified") || t.includes("success")) {
    return <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
  }
  if (t.includes("welcome")) {
    return <Flame className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
  }
  if (t.includes("secure") || t.includes("safe") || t.includes("trust")) {
    return <ShieldCheck className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
  }
  return <Info className="w-5 h-5 text-zinc-400 flex-shrink-0 mt-0.5" />
}

function progressColor(title?: React.ReactNode, variant?: string | null) {
  const t = String(title ?? "").toLowerCase()
  if (variant === "destructive" || t.includes("error") || t.includes("invalid")) return "#ef4444"
  if (t.includes("verified") || t.includes("success")) return "#22c55e"
  if (t.includes("resent")) return "#eab308"
  return "#ea580c"
}

import React from "react"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider duration={DURATION} swipeDirection="right">
      <style>{`
        @keyframes toast-progress {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
        .toast-progress-bar {
          transform-origin: left;
          animation: toast-progress ${DURATION}ms linear forwards;
        }
      `}</style>

      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <Toast key={id} variant={variant} {...props}>
            {/* Left accent bar */}
            <div
              className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl"
              style={{ background: progressColor(title, variant) }}
            />

            {/* Icon */}
            {toastIcon(title, variant)}

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="grid gap-0.5">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && <ToastDescription>{description}</ToastDescription>}
              </div>
            </div>

            {action}
            <ToastClose />

            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/5 rounded-b-2xl overflow-hidden">
              <div
                className="toast-progress-bar h-full rounded-full"
                style={{ background: progressColor(title, variant) }}
              />
            </div>
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
