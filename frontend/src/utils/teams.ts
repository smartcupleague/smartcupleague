const TEAM_FLAGS: Record<string, string> = {
  ALGERIA: '/flags/worldcup-2026/flag_algeria.jpg',
  ARGENTINA: '/flags/worldcup-2026/flag_argentina.jpg',
  AUSTRALIA: '/flags/worldcup-2026/flag_australia.jpg',
  AUSTRIA: '/flags/worldcup-2026/flag_austria.jpg',
  BELGIUM: '/flags/worldcup-2026/flag_belgica.jpg',
  'BOSNIA-HERZEGOVINA': '/flags/worldcup-2026/flag_bosnia_and_herzegovina.jpg',
  'BOSNIA AND HERZEGOVINA': '/flags/worldcup-2026/flag_bosnia_and_herzegovina.jpg',
  BRAZIL: '/flags/worldcup-2026/flag_brasil.jpg',
  CAMEROON: '/flags/worldcup-2026/flag_camaroes.jpg',
  CANADA: '/flags/worldcup-2026/flag_canada.jpg',
  'CAPE VERDE ISLANDS': '/flags/worldcup-2026/flag_cabo_verde.jpg',
  'CAPE VERDE': '/flags/worldcup-2026/flag_cabo_verde.jpg',
  COLOMBIA: '/flags/worldcup-2026/flag_colombia.jpg',
  'CONGO DR': '/flags/worldcup-2026/flag_congo_dr.jpg',
  CROATIA: '/flags/worldcup-2026/flag_croatia.jpg',
  CURACAO: '/flags/worldcup-2026/flag_curacao.jpg',
  'CURAÇAO': '/flags/worldcup-2026/flag_curacao.jpg',
  CZECHIA: '/flags/worldcup-2026/flag_czechia.jpg',
  'CZECH REPUBLIC': '/flags/worldcup-2026/flag_czechia.jpg',
  DENMARK: '/flags/worldcup-2026/flag_dinamarca.jpg',
  ECUADOR: '/flags/worldcup-2026/flag_equador.jpg',
  EGYPT: '/flags/worldcup-2026/flag_egypt.jpg',
  ENGLAND: '/flags/worldcup-2026/flag_england.jpg',
  FRANCE: '/flags/worldcup-2026/flag_france.jpg',
  GERMANY: '/flags/worldcup-2026/flag_germany.jpg',
  GHANA: '/flags/worldcup-2026/flag_ghana.jpg',
  HAITI: '/flags/worldcup-2026/flag_haiti.jpg',
  IRAN: '/flags/worldcup-2026/flag_iran.jpg',
  'IR IRAN': '/flags/worldcup-2026/flag_iran.jpg',
  IRAQ: '/flags/worldcup-2026/flag_iraq.jpg',
  'IVORY COAST': '/flags/worldcup-2026/flag_cote_ivoiry.jpg',
  'COTE D IVOIRE': '/flags/worldcup-2026/flag_cote_ivoiry.jpg',
  "COTE D'IVOIRE": '/flags/worldcup-2026/flag_cote_ivoiry.jpg',
  JAPAN: '/flags/worldcup-2026/flag_japan.jpg',
  JORDAN: '/flags/worldcup-2026/flag_jordan.jpg',
  KOREA: '/flags/worldcup-2026/flag_korea.jpg',
  'KOREA REPUBLIC': '/flags/worldcup-2026/flag_korea.jpg',
  'SOUTH KOREA': '/flags/worldcup-2026/flag_korea.jpg',
  MEXICO: '/flags/worldcup-2026/flag_mexico.jpg',
  MOROCCO: '/flags/worldcup-2026/flag_Moroco.jpg',
  NETHERLANDS: '/flags/worldcup-2026/flag_netherlands.jpg',
  'NEW ZEALAND': '/flags/worldcup-2026/flag_New_Zealand.jpg',
  NORWAY: '/flags/worldcup-2026/flag_Norway.jpg',
  PANAMA: '/flags/worldcup-2026/flag_Panama.jpg',
  PARAGUAY: '/flags/worldcup-2026/flag_Paraguay.jpg',
  POLAND: '/flags/worldcup-2026/flag_poland.jpg',
  PORTUGAL: '/flags/worldcup-2026/flag_portugal.jpg',
  QATAR: '/flags/worldcup-2026/flag_qatar.jpg',
  'SAUDI ARABIA': '/flags/worldcup-2026/flag_Saudi Arabia.jpg',
  SCOTLAND: '/flags/worldcup-2026/flag_scotland.jpg',
  SENEGAL: '/flags/worldcup-2026/flag_senegal.jpg',
  SERBIA: '/flags/worldcup-2026/flag_servia.jpg',
  SERVIA: '/flags/worldcup-2026/flag_servia.jpg',
  'SOUTH AFRICA': '/flags/worldcup-2026/flag_south_africa.jpg',
  SPAIN: '/flags/worldcup-2026/flag_Spain.jpg',
  SWEDEN: '/flags/worldcup-2026/flag_sweden.jpg',
  SWITZERLAND: '/flags/worldcup-2026/flag_switzerland.jpg',
  TUNISIA: '/flags/worldcup-2026/flag_tunis.jpg',
  TURKEY: '/flags/worldcup-2026/flag_turkiye.jpg',
  TURKIYE: '/flags/worldcup-2026/flag_turkiye.jpg',
  'UNITED STATES': '/flags/worldcup-2026/flag_usa.jpg',
  URUGUAY: '/flags/worldcup-2026/flag_uruguay.jpg',
  USA: '/flags/worldcup-2026/flag_usa.jpg',
  UZBEKISTAN: '/flags/worldcup-2026/flag_uzbekistan.jpg',
  'EURO PLAYOFF': '/flags/worldcup-2026/flag_euro_playoff.jpg',
  'IC PLAYOFF 1': '/flags/worldcup-2026/flag_ic_playoff1.jpg',
};

const TEAM_FLAG_CODES: Record<string, string> = {
  ALGERIA: 'dz',
  AUSTRALIA: 'au',
  AUSTRIA: 'at',
  'BOSNIA-HERZEGOVINA': 'ba',
  'BOSNIA AND HERZEGOVINA': 'ba',
  'CAPE VERDE ISLANDS': 'cv',
  'CAPE VERDE': 'cv',
  COLOMBIA: 'co',
  'CONGO DR': 'cd',
  CURACAO: 'cw',
  'CURAÇAO': 'cw',
  CZECHIA: 'cz',
  'CZECH REPUBLIC': 'cz',
  EGYPT: 'eg',
  HAITI: 'ht',
  IRAQ: 'iq',
  'IVORY COAST': 'ci',
  'COTE D IVOIRE': 'ci',
  "COTE D'IVOIRE": 'ci',
  JORDAN: 'jo',
  'NEW ZEALAND': 'nz',
  NORWAY: 'no',
  PANAMA: 'pa',
  PARAGUAY: 'py',
  SCOTLAND: 'gb-sct',
  SWEDEN: 'se',
  TURKEY: 'tr',
  UZBEKISTAN: 'uz',
};

function normalizeTeamKey(name: string): string {
  return (name || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function getTeamFlagSrc(name: string): string | null {
  const exactKey = (name || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const normalizedKey = normalizeTeamKey(name);
  const local = TEAM_FLAGS[exactKey] ?? TEAM_FLAGS[normalizedKey];
  if (local) return local;

  const code = TEAM_FLAG_CODES[exactKey] ?? TEAM_FLAG_CODES[normalizedKey];
  return code ? `https://flagcdn.com/w640/${code}.png` : null;
}

type WorldCupTeam = {
  value: string;
};

const WORLD_CUP_TEAMS: WorldCupTeam[] = [
  { value: 'Algeria' },
  { value: 'Argentina' },
  { value: 'Australia' },
  { value: 'Austria' },
  { value: 'Belgium' },
  { value: 'Bosnia-Herzegovina' },
  { value: 'Brazil' },
  { value: 'Canada' },
  { value: 'Cape Verde Islands' },
  { value: 'Colombia' },
  { value: 'Congo DR' },
  { value: 'Croatia' },
  { value: 'Curaçao' },
  { value: 'Czechia' },
  { value: 'Ecuador' },
  { value: 'Egypt' },
  { value: 'England' },
  { value: 'France' },
  { value: 'Germany' },
  { value: 'Ghana' },
  { value: 'Haiti' },
  { value: 'Iran' },
  { value: 'Iraq' },
  { value: 'Ivory Coast' },
  { value: 'Japan' },
  { value: 'Jordan' },
  { value: 'Mexico' },
  { value: 'Morocco' },
  { value: 'Netherlands' },
  { value: 'New Zealand' },
  { value: 'Norway' },
  { value: 'Panama' },
  { value: 'Paraguay' },
  { value: 'Portugal' },
  { value: 'Qatar' },
  { value: 'Saudi Arabia' },
  { value: 'Scotland' },
  { value: 'Senegal' },
  { value: 'South Africa' },
  { value: 'South Korea' },
  { value: 'Spain' },
  { value: 'Sweden' },
  { value: 'Switzerland' },
  { value: 'Tunisia' },
  { value: 'Turkey' },
  { value: 'United States' },
  { value: 'Uruguay' },
  { value: 'Uzbekistan' },
].sort((a, b) => a.value.localeCompare(b.value, undefined, { sensitivity: 'base' }));

const WORLD_CUP_TEAM_LABELS = WORLD_CUP_TEAMS.reduce<Record<string, string>>((acc, team) => {
  acc[team.value] = team.value;
  return acc;
}, {});

export { TEAM_FLAGS, WORLD_CUP_TEAMS, WORLD_CUP_TEAM_LABELS, getTeamFlagSrc };
