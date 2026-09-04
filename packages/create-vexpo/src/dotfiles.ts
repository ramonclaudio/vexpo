export const STRIPPED_DOTFILES = [
  ".gitignore",
  ".env.example",
  ".oxfmtrc.json",
  ".oxlintrc.json",
  ".editorconfig",
  ".gitattributes",
  ".easignore",
  ".fingerprintignore",
  ".npmrc",
];

export function strippedToUnderscore(name: string): string {
  return name.replace(/^\./, "_");
}
