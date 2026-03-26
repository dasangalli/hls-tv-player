import { useCallback } from 'react';
import { Platform, useTVEventHandler } from 'react-native';

type TVEventHandler = Parameters<typeof useTVEventHandler>[0];

export function useSafeTVEventHandler(handler: TVEventHandler) {
  const noop = useCallback(() => {}, []);
  useTVEventHandler(Platform.isTV ? handler : noop);
}
