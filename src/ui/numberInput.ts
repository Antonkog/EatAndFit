export function shouldSelectZeroNumberInput(type: string, value: string, disabled = false, readOnly = false) {
  if (type !== 'number' || disabled || readOnly || value.trim() === '') return false;
  return Number(value) === 0;
}

export function selectZeroNumberInput(target: EventTarget | null) {
  if (!(target instanceof HTMLInputElement)) return false;
  if (!shouldSelectZeroNumberInput(target.type, target.value, target.disabled, target.readOnly)) return false;
  target.select();
  return true;
}
