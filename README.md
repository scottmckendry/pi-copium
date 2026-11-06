# pi-copium

> something to smoke while you burn tokens.

my personal pi config, packaged so I don't have to put typescript in my dotfiles. use it if you want, or don't. there are plenty of others out there.

## what's in here?

- **working messages**: a fancy shimmering working message line to stare at.
- **statusline**: hardcoded one-line footer
- **sticky models**: picking or cycling to a model saves it as the global default.
- **previews**: syntax-highlighted tool previews (commands, files, diffs, search results) via [pi-code-previews](https://github.com/mattleong/pi-code-previews). The Shiki theme is generated from the active Pi theme, tool frames are border-only, and preview borders use the theme accent (cyan in Cyberdream).

## install

```bash
pi install git:github.com/scottmckendry/pi-copium
```

then `/reload` or restart pi.

## contributing

slop PRs only - if I can tell it was written by a human I won't merge it
