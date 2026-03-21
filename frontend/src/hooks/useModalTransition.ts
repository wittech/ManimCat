import { useState, useEffect } from 'react';

export function useModalTransition(isOpen: boolean, duration: number = 400) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsExiting(false);
    } else if (shouldRender) {
      setIsExiting(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsExiting(false);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isOpen, shouldRender, duration]);

  return { shouldRender, isExiting };
}
