import { cn } from "@/lib/utils";

interface CoinIconProps {
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
  width?: number;
  height?: number;
}

export function CoinIcon({ className, style, width, height }: CoinIconProps) {
  const size = width ?? height ?? 16;
  return (
    <span
      style={{ fontSize: size, lineHeight: 1, ...style }}
      className={cn("text-amber-400 font-bold inline-flex items-center justify-center", className)}
    >
      ₹
    </span>
  );
}
