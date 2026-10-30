import stringWidth from "string-width";

export const width = (text: string): number => stringWidth(text, { ambiguousIsNarrow: true });
