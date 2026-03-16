import { createSignal } from 'solid-js';

const [isLoading, setIsLoading] = createSignal(true);
const [loadingText, setLoadingText] = createSignal('Loading...');

export const loadingStore = {
  isLoading,
  loadingText,
  setLoading: (loading: boolean, text?: string) => {
    setIsLoading(loading);
    if (text !== undefined) setLoadingText(text);
  },
  showLoading: (text?: string) => {
    setIsLoading(true);
    if (text) setLoadingText(text);
  },
  hideLoading: () => setIsLoading(false),
};
