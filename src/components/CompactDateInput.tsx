function readableDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

/**
 * A native date picker with a predictable visible face. Mobile browsers give
 * date inputs an intrinsic width that can overflow a compact CSS grid.
 */
export function CompactDateInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <span className="compact-date-control">
      <span aria-hidden="true">{readableDate(value)}</span>
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </span>
  );
}
