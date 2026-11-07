# pi-copium

> something to smoke while you burn tokens.

my personal pi config, packaged so I don't have to put typescript in my dotfiles. use it if you want, or don't. there are plenty of others out there.

## what's in here?

- **working messages**: a fancy shimmering working message line to stare at.
- **statusline**: hardcoded one-line footer
- **sticky models**: picking or cycling to a model saves it as the global default.
- **session pruning**: on startup, sessions inactive for 30 days are permanently deleted, keeping the 10 most recent plus named and active sessions.
- **previews**: syntax-highlighted tool previews (commands, files, diffs, search results) via [pi-code-previews](https://github.com/mattleong/pi-code-previews). The Shiki theme is generated from the active Pi theme and tool frames are border-only, with a subtle frame and per-tool Nerd Font icon color (Blink-style).

## install

```bash
pi install git:github.com/scottmckendry/pi-copium
```

then `/reload` or restart pi.

## contributing

slop PRs only - if I can tell it was written by a human I won't merge it
