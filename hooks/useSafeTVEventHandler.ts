import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

export function useSafeTVEventHandler(
  componentRef: React.RefObject<any>,
  handler: (evt: any) => void
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!Platform.isTV) return;

    let TVEventHandler: any;
    try {
      TVEventHandler = require('react-native').TVEventHandler;
    } catch (e) {
      return;
    }
    if (!TVEventHandler) return;

    const instance = new TVEventHandler();
    instance.enable(componentRef.current, (_cmp: any, evt: any) => {
      if (evt) handlerRef.current(evt);
    });

    return () => instance.disable();
  }, []);
}
