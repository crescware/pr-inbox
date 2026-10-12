export const width = (text: string): number => {
  return [...text].reduce(
    (n, ch) =>
      n +
      (/\p{Mark}/u.test(ch)
        ? 0
        : /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}\u3000-\u30FF\uFF01-\uFF60]/u.test(
              ch,
            )
          ? 2
          : 1),
    0,
  );
};
