import { useEffect, useState } from "react";

/** Renvoie `value` seulement après `delay` ms sans changement (évite un appel API par touche). */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
