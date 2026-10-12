export const latest = (values: (string | null | undefined)[]): string | null => {
  const valid = values.filter((v): v is string => Boolean(v && Number.isFinite(Date.parse(v))));
  return valid.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
};
