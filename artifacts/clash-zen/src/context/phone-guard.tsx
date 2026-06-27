import { createContext, useContext, useState, useRef, useEffect, ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import PhoneVerifyModal from "@/components/phone-verify-modal";

interface PhoneGuardContextType {
  requirePhone: (callback?: () => void) => void;
}

const PhoneGuardContext = createContext<PhoneGuardContextType>({
  requirePhone: (cb) => cb?.(),
});

export function PhoneGuardProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const pendingCallbackRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const handler = () => {
      pendingCallbackRef.current = null;
      setIsOpen(true);
    };
    window.addEventListener("phone-required", handler);
    return () => window.removeEventListener("phone-required", handler);
  }, []);

  const requirePhone = (callback?: () => void) => {
    if (user?.isProfileComplete) {
      callback?.();
      return;
    }
    pendingCallbackRef.current = callback ?? null;
    setIsOpen(true);
  };

  const onComplete = () => {
    setIsOpen(false);
    const cb = pendingCallbackRef.current;
    pendingCallbackRef.current = null;
    if (cb) cb();
  };

  return (
    <PhoneGuardContext.Provider value={{ requirePhone }}>
      {children}
      <PhoneVerifyModal isOpen={isOpen} onComplete={onComplete} onClose={() => setIsOpen(false)} />
    </PhoneGuardContext.Provider>
  );
}

export function usePhoneGuard() {
  return useContext(PhoneGuardContext);
}
