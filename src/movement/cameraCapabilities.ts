export type CameraSwitchEvidence = {
  handheld: boolean;
  facingModes?: readonly string[];
  labeledVideoInputs: number;
};

export function isHandheldCameraContext() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return navigator.maxTouchPoints > 0 && Boolean(window.matchMedia?.('(pointer: coarse)').matches);
}

export function shouldOfferCameraSwitch({ handheld, facingModes = [], labeledVideoInputs }: CameraSwitchEvidence) {
  if (!handheld) return false;
  const normalizedModes = new Set(facingModes.map((mode) => mode.toLowerCase()));
  if (normalizedModes.has('user') && normalizedModes.has('environment')) return true;
  return labeledVideoInputs > 1;
}
