import { cn } from "@/lib/utils";

interface CoinIconProps {
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
  width?: number;
  height?: number;
}

export function CoinIcon({ className, strokeWidth = 2, style, width, height }: CoinIconProps) {
  const size = width ?? height ?? 16;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      style={style}
      className={cn("text-amber-400", className)}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
    </svg>
  );
}
