type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string };
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

export type PwaInstallState = {
  standalone: boolean;
  ios: boolean;
  promptAvailable: boolean;
};

let installPrompt: BeforeInstallPromptEvent | undefined;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function isStandaloneMode() {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || iosNavigator.standalone === true;
}

export function isIosDevice() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function pwaInstallState(): PwaInstallState {
  return { standalone: isStandaloneMode(), ios: isIosDevice(), promptAvailable: Boolean(installPrompt) };
}

export function subscribePwaInstall(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function requestPwaInstall() {
  if (!installPrompt) return undefined;
  const prompt = installPrompt;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  installPrompt = undefined;
  notify();
  return choice.outcome;
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event as BeforeInstallPromptEvent;
  notify();
});

window.addEventListener('appinstalled', () => {
  installPrompt = undefined;
  notify();
});

window.matchMedia('(display-mode: standalone)').addEventListener('change', notify);
