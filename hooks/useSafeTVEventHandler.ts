import { useCallback } from 'react';
import { Platform, useTVEventHandler } from 'react-native';

type TVEventHandler = Parameters<typeof useTVEventHandler>[0];

/**
 * Wrapper sicuro per useTVEventHandler.
 * Su TV usa il vero handler nativo; su altri dispositivi usa un no-op
 * per evitare crash da modulo nativo non inizializzato.
 */
export function useSafeTVEventHandler(handler: TVEventHandler) {
  const noop = useCallback(() => {}, []);
  useTVEventHandler(Platform.isTV ? handler : noop);
}
