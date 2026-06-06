export function parseTimestampInput(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Timestamp must use YYYY-MM-DDTHH:mm:ss.");
  const [, y, mo, d, h, mi, s] = match;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), 0);
  if (
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== Number(mo) - 1 ||
    date.getDate() !== Number(d) ||
    date.getHours() !== Number(h) ||
    date.getMinutes() !== Number(mi) ||
    date.getSeconds() !== Number(s)
  ) {
    throw new Error("Timestamp is not a valid calendar date.");
  }
  return date;
}

export function timestampInputToTouchStamp(value: string): string {
  parseTimestampInput(value);
  return `${value.slice(0, 4)}${value.slice(5, 7)}${value.slice(8, 10)}${value.slice(11, 13)}${value.slice(14, 16)}.${value.slice(17, 19)}`;
}
