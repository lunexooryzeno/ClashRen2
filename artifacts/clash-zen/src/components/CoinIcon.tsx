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
    <img
      src="/coin.png"
      alt="coin"
      width={size}
      height={size}
      style={{ display: "inline-block", flexShrink: 0, ...style }}
      className={cn("", className)}
    />
  );
}
