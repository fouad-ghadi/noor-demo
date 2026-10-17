/** Infobulle commune aux graphiques Recharts (texte en encre neutre, pastille de couleur pour l'identité). */
interface Item {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  payload?: Record<string, unknown>;
  dataKey?: string | number;
}

interface Props {
  active?: boolean;
  label?: string | number;
  payload?: readonly Item[];
  labelFormatter?: (label: string | number) => string;
  valueFormatter?: (value: number, item: Item) => string;
}

export function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter }: Props) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-md">
      {label !== undefined && <p className="mb-1 font-medium">{labelFormatter ? labelFormatter(label) : label}</p>}
      <div className="space-y-0.5">
        {payload.map((item) => (
          <p key={String(item.dataKey ?? item.name)} className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ background: item.color }} />
            <span className="text-muted-foreground">{item.name}</span>
            <span className="tabular ml-auto pl-3 font-semibold">
              {valueFormatter ? valueFormatter(Number(item.value), item) : String(item.value)}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}
