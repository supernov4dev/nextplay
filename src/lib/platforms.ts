// Vocabulaire fermé des plateformes jouées : garantit l'uniformité des
// données (filtres, stats). À enrichir ici si une plateforme manque.

export const PLATFORMS = [
  'PC',
  'PlayStation',
  'PlayStation 2',
  'PlayStation 3',
  'PlayStation 4',
  'PlayStation 5',
  'PSP',
  'PS Vita',
  'Xbox',
  'Xbox 360',
  'Xbox One',
  'Xbox Series',
  'NES',
  'Super Nintendo',
  'Nintendo 64',
  'GameCube',
  'Wii',
  'Wii U',
  'Switch',
  'Game Boy',
  'Game Boy Advance',
  'DS',
  '3DS',
  'Master System',
  'Mega Drive',
  'Saturn',
  'Dreamcast',
  'Mobile',
  'Autre',
] as const

export type Platform = (typeof PLATFORMS)[number]

// Noms de plateformes IGDB → notre vocabulaire (les noms identiques aux
// nôtres n'ont pas besoin d'entrée). Sert à pré-suggérer les plateformes
// du jeu sélectionné dans l'écran d'ajout.
const IGDB_TO_PLATFORM: Record<string, Platform> = {
  'PC (Microsoft Windows)': 'PC',
  Linux: 'PC',
  Mac: 'PC',
  'Nintendo Switch': 'Switch',
  'Nintendo Switch 2': 'Switch',
  'Nintendo Entertainment System': 'NES',
  'Family Computer': 'NES',
  'Family Computer Disk System': 'NES',
  'Super Nintendo Entertainment System': 'Super Nintendo',
  'Super Famicom': 'Super Nintendo',
  'Nintendo GameCube': 'GameCube',
  'Nintendo DS': 'DS',
  'Nintendo 3DS': '3DS',
  'New Nintendo 3DS': '3DS',
  'Game Boy Color': 'Game Boy',
  'Xbox Series X|S': 'Xbox Series',
  'PlayStation Portable': 'PSP',
  'PlayStation Vita': 'PS Vita',
  'Sega Master System/Mark III': 'Master System',
  'Sega Mega Drive/Genesis': 'Mega Drive',
  'Sega Saturn': 'Saturn',
  Android: 'Mobile',
  iOS: 'Mobile',
}

const KNOWN = new Set<string>(PLATFORMS)

export function suggestedPlatforms(igdbPlatforms: string[]): Platform[] {
  const out: Platform[] = []
  for (const name of igdbPlatforms) {
    const mapped = IGDB_TO_PLATFORM[name] ?? (KNOWN.has(name) ? (name as Platform) : null)
    if (mapped && !out.includes(mapped)) out.push(mapped)
  }
  return out
}
