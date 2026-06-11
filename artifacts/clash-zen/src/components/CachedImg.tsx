import { useState, useEffect, useRef, type ImgHTMLAttributes } from "react";
import { getCached, preloadImage } from "@/lib/imageCache";

interface CachedImgProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

export function CachedImg({ src, ...props }: CachedImgProps) {
  const isStorage = src && (src.startsWith("/api/storage") || src.startsWith("/api/"));
  const immediate = isStorage ? getCached(src) : undefined;
  const [blobSrc, setBlobSrc] = useState<string | undefined>(immediate);
  const latestSrc = useRef(src);

  useEffect(() => {
    latestSrc.current = src;
    if (!isStorage) {
      setBlobSrc(undefined);
      return;
    }
    const cached = getCached(src);
    if (cached) {
      setBlobSrc(cached);
      return;
    }
    setBlobSrc(undefined);
    preloadImage(src).then(url => {
      if (latestSrc.current === src) setBlobSrc(url);
    }).catch(() => {});
  }, [src, isStorage]);

  return <img loading="lazy" decoding="async" {...props} src={blobSrc ?? src} />;
}
