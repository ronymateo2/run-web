export interface TzOption { value: string; label: string; }
export interface TzGroup { region: string; zones: TzOption[]; }

export const COMMON_TIMEZONES: TzGroup[] = [
  {
    region: "América Central y Caribe",
    zones: [
      { value: "America/Guatemala", label: "Guatemala (UTC-6)" },
      { value: "America/Tegucigalpa", label: "Tegucigalpa (UTC-6)" },
      { value: "America/Managua", label: "Managua (UTC-6)" },
      { value: "America/Costa_Rica", label: "San José (UTC-6)" },
      { value: "America/El_Salvador", label: "San Salvador (UTC-6)" },
      { value: "America/Panama", label: "Panamá (UTC-5)" },
      { value: "America/Havana", label: "La Habana (UTC-5/-4)" },
      { value: "America/Santo_Domingo", label: "Santo Domingo (UTC-4)" },
      { value: "America/Puerto_Rico", label: "Puerto Rico (UTC-4)" },
    ],
  },
  {
    region: "América del Sur",
    zones: [
      { value: "America/Bogota", label: "Bogotá (UTC-5)" },
      { value: "America/Lima", label: "Lima (UTC-5)" },
      { value: "America/Caracas", label: "Caracas (UTC-4)" },
      { value: "America/La_Paz", label: "La Paz (UTC-4)" },
      { value: "America/Santiago", label: "Santiago (UTC-4/-3)" },
      { value: "America/Asuncion", label: "Asunción (UTC-4/-3)" },
      { value: "America/Buenos_Aires", label: "Buenos Aires (UTC-3)" },
      { value: "America/Montevideo", label: "Montevideo (UTC-3)" },
      { value: "America/Sao_Paulo", label: "São Paulo (UTC-3/-2)" },
      { value: "America/Guayaquil", label: "Guayaquil (UTC-5)" },
    ],
  },
  {
    region: "América del Norte",
    zones: [
      { value: "America/Mexico_City", label: "Ciudad de México (UTC-6/-5)" },
      { value: "America/Monterrey", label: "Monterrey (UTC-6/-5)" },
      { value: "America/New_York", label: "Nueva York (UTC-5/-4)" },
      { value: "America/Chicago", label: "Chicago (UTC-6/-5)" },
      { value: "America/Denver", label: "Denver (UTC-7/-6)" },
      { value: "America/Los_Angeles", label: "Los Ángeles (UTC-8/-7)" },
      { value: "America/Toronto", label: "Toronto (UTC-5/-4)" },
      { value: "America/Vancouver", label: "Vancouver (UTC-8/-7)" },
      { value: "Pacific/Honolulu", label: "Hawái (UTC-10)" },
    ],
  },
  {
    region: "Europa",
    zones: [
      { value: "Europe/Madrid", label: "Madrid (UTC+1/+2)" },
      { value: "Europe/London", label: "Londres (UTC+0/+1)" },
      { value: "Europe/Paris", label: "París (UTC+1/+2)" },
      { value: "Europe/Berlin", label: "Berlín (UTC+1/+2)" },
      { value: "Europe/Lisbon", label: "Lisboa (UTC+0/+1)" },
      { value: "Europe/Rome", label: "Roma (UTC+1/+2)" },
    ],
  },
  {
    region: "Otras",
    zones: [
      { value: "Asia/Tokyo", label: "Tokio (UTC+9)" },
      { value: "Australia/Sydney", label: "Sídney (UTC+10/+11)" },
      { value: "Pacific/Auckland", label: "Auckland (UTC+12/+13)" },
    ],
  },
];

export function detectTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function localToday(tz?: string | null): string {
  const zone = tz || detectTimezone();
  return new Date().toLocaleDateString("en-CA", { timeZone: zone });
}

export function localDayName(tz?: string | null): string {
  const zone = tz || detectTimezone();
  return new Intl.DateTimeFormat("es", { weekday: "long", timeZone: zone }).format(new Date());
}
