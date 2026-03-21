# Arcs Card Tracker — Project Context

## What this is
A mobile-friendly web app for tracking cards during a game of **Arcs** (the board game by Leder Games). It runs as a static site deployed on Netlify. No framework, no build step — plain HTML, CSS, JS.

## Design system
- **Dark only.** Background layers: `--void #060810` → `--deep #0b1120` → `--surface #111928` → `--raised #19243c`
- **Accent:** amber/gold `#c8a038`
- **Typography:** `FMBolyarPro` (woff2/woff/ttf in `/fonts/`) — weight 300 for display, weight 100 for labels.
- **Geometry:** sharp corners (2px radius), 1px borders, thin colour accent bar on card left edge
- **No emojis, no rounded bubbly UI.** Keep it clean and minimal.

## File structure
index.html, styles.css, script.js, cards.json, fonts/, netlify.toml

## Card data (cards.json)
{ "cards": [ { "type": "court|leader|lore", "title": "NAME (Type)", "description": "..." } ] }
- Court (~30), Leader (~14), Lore (~24) cards
- Placeholders exist for 1 unknown VOX court card and 2 unknown Leader cards (Leaders & Lore Pack)

## Game Mode — court deck flow
1. Toggle GAME MODE → court cards shuffle into a deck
2. DRAW CARD → next card enters the court, auto-assigned to 'court'
3. Click a player colour → card moves from court to that player
4. Click court square on a held card → returns it to the court
5. Click none → discards the card
6. RESET DECK → shuffles non-held cards back

## Assignment buttons per type
- Court: none · court · red · blue · gold · white
- Leader: none · red · blue · gold · white
- Lore: none · draft · red · blue · gold · white

## Persistence
localStorage key `arcs-v1`. Saves assignments, courtStates, courtOrder, gameMode.

## Deployment
Netlify, auto-deploys from main. No build command. Publish directory `.`.
