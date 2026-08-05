import { useState, useEffect, useRef, useCallback, type ImgHTMLAttributes } from "react";
import { getCached, preloadImage } from "@/lib/imageCache";

interface CachedImgProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  /** Shown when the primary src fails to load (preload error or browser error). */
  fallbackSrc?: string;
}

export function CachedImg({ src, fallbackSrc, onError: outerOnError, ...props }: CachedImgProps) {
  const isStorage = src && (src.startsWith("/api/storage") || src.startsWith("/api/"));
  const immediate = isStorage ? getCached(src) : undefined;

  // undefined = still loading, null = preload failed, string = blob URL ready
  const [blobSrc, setBlobSrc] = useState<string | null | undefined>(immediate);
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
    preloadImage(src)
      .then(url => {
        if (latestSrc.current === src) setBlobSrc(url);
      })
      .catch(() => {
        // Mark as failed so we immediately render the fallback
        if (latestSrc.current === src) setBlobSrc(null);
      });
  }, [src, isStorage]);

  // Native img error handler — catches cases where the browser itself can't
  // load the src (e.g. the preload was skipped for non-/api/ URLs, or the blob
  // URL was revoked). Swaps to fallbackSrc when provided.
  const handleError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (fallbackSrc && img.src !== fallbackSrc) {
      img.onerror = null; // prevent infinite loop
      img.src = fallbackSrc;
    }
    outerOnError?.(e);
  }, [fallbackSrc, outerOnError]);

  // When preload failed AND we have a fallback, skip the broken URL entirely.
  const effectiveSrc = blobSrc === null
    ? (fallbackSrc ?? src)
    : (blobSrc ?? src);

  return (
    <img
      loading="lazy"
      decoding="async"
      {...props}
      src={effectiveSrc}
      onError={handleError}
    />
  );
}
