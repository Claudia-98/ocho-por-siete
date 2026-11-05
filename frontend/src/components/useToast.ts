import { useCallback, useEffect, useState } from "react";

/** Cuánto dura visible un aviso. */
export const TOAST_MS = 2500;

/** Estado de un aviso breve: `show` lo reemplaza y reinicia el tiempo; se oculta solo. */
export function useToast() {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  const show = useCallback((message: string) => setToast((t) => ({ id: (t?.id ?? 0) + 1, message })), []);
  const hide = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(hide, TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, hide]);

  return { message: toast?.message ?? null, show, hide };
}
