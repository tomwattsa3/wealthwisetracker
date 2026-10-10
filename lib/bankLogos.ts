// Logos for known banks, matched by the account's name. Files live in public/banks/.
// A bank without a logo keeps its initials badge.
const LOGOS: [RegExp, string][] = [
  [/revolut/i, '/banks/revolut.png'],
  [/\bwio\b/i, '/banks/wio.png'],
];

export const bankLogo = (name: string | undefined | null) => (name ? LOGOS.find(([re]) => re.test(name))?.[1] : undefined);
