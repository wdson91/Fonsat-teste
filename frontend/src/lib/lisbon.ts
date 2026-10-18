const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Lisbon',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
function parts(instant: Date) {
  return Object.fromEntries(
    clock.formatToParts(instant).map((part) => [part.type, part.value]),
  );
}
export function lisbonDay(instant = new Date()): string {
  const value = parts(instant);
  return `${value.year}-${value.month}-${value.day}`;
}
export function lisbonTime(instant: string): string {
  const value = parts(new Date(instant));
  return `${value.hour}:${value.minute}`;
}
export function calendarShift(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function weekStart(day: string): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return calendarShift(day, -(weekday + 6) % 7);
}
export function displayDay(
  day: string,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' },
): string {
  return new Intl.DateTimeFormat('pt-PT', {
    ...options,
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`));
}

/** Não usa o fuso do dispositivo. Duas soluções = hora ambígua; nenhuma = hora inexistente. */
export function lisbonTimestamp(day: string, time: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    throw new Error('Indique um dia e uma hora válidos.');
  const [year, month, date] = day.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const target = Date.UTC(year, month - 1, date, hour, minute);
  if (
    new Date(Date.UTC(year, month - 1, date, 12)).toISOString().slice(0, 10) !==
    day
  )
    throw new Error('Dia de calendário inválido.');
  const offsets = new Set<number>();
  for (const hours of [-36, 0, 36]) {
    const probe = target + hours * 3600000;
    const local = parts(new Date(probe));
    offsets.add(
      Date.UTC(
        +local.year,
        +local.month - 1,
        +local.day,
        +local.hour,
        +local.minute,
        +local.second,
      ) - probe,
    );
  }
  const matches = [...offsets].filter((offset) => {
    const local = parts(new Date(target - offset));
    return (
      `${local.year}-${local.month}-${local.day}` === day &&
      `${local.hour}:${local.minute}` === time &&
      local.second === '00'
    );
  });
  if (!matches.length)
    throw new Error('Esta hora não existe em Lisboa devido à mudança de hora.');
  if (matches.length > 1)
    throw new Error(
      'Esta hora é ambígua em Lisboa devido à mudança de hora. Escolha um horário inequívoco.',
    );
  const minutesOffset = matches[0] / 60000;
  return `${day}T${time}:00${minutesOffset < 0 ? '-' : '+'}${String(Math.floor(Math.abs(minutesOffset) / 60)).padStart(2, '0')}:${String(Math.abs(minutesOffset) % 60).padStart(2, '0')}`;
}
