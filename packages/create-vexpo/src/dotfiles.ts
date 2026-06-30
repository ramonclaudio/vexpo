// Dotfiles npm strips from published tarballs. The build renames each to an
// underscore-prefixed name so it ships in the template, then
// `restoreStrippedDotfiles` swaps them back at scaffold time. Single source of
// truth for both steps; the strip and restore sides must agree or a stripped
// dotfile never gets restored.
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

// `.gitignore` -> `_gitignore`. npm won't strip the underscore form from a
// published tarball.
export function strippedToUnderscore(name: string): string {
  return name.replace(/^\./, "_");
}
