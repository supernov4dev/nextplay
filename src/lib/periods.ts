// Formatage des périodes de jeu : "1998, 2015-2017"
export function formatPeriods(
  periods: { startYear: number; endYear: number | null }[],
): string {
  return periods
    .map((p) =>
      p.endYear && p.endYear !== p.startYear
        ? `${p.startYear}-${p.endYear}`
        : String(p.startYear),
    )
    .join(', ')
}
