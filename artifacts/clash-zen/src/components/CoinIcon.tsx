import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";

interface CoinIconProps {
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
  width?: number;
  height?: number;
}

export function CoinIcon({ className, strokeWidth = 2, style, width, height }: CoinIconProps) {
  return (
    <Coins
      className={cn("text-amber-400", className)}
      strokeWidth={strokeWidth}
      style={style}
      width={width}
      height={height}
    />
  );
}
