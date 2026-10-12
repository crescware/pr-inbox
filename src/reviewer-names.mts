export const reviewerNames = (names: string[]): string[] => {
  return [...new Map(names.map((name) => [name.toLowerCase(), name])).values()].sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" }),
  );
};
