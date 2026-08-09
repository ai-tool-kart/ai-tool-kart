interface StatBlockProps {
  value: string
  label: string
}

/** Big number over an uppercase label — the hero stats row. */
export default function StatBlock({ value, label }: StatBlockProps) {
  return (
    <div className="text-center">
      <div className="text-[30px] font-bold tracking-[-0.032em] text-ink">{value}</div>
      <div className="mt-[7px] text-[11px] tracking-[0.18em] uppercase text-subtle-dim">
        {label}
      </div>
    </div>
  )
}
