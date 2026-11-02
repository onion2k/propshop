# Propshop

A browser game about high-frequency trading. You run a tiny proprietary
trading firm on a simulated stock market with two exchanges. You build a
strategy out of blocks, watch it trade, and spend what it makes on a better
office, a faster network and bigger computers, because in this business the
fast firm eats the slow one's lunch.

It is a learning tool. Every order you send comes back with the story of its
race: how old the quote was when you sent it, how long the order took to
arrive, and who took the quote first and by how many milliseconds. Every idea
the game uses has a plain explanation in the game itself: what an order book is, why two exchanges can disagree about
a price for a few hundred milliseconds, why latency is worth paying for, how
a market maker earns the spread and gets hurt by inventory, how news moves a
fair value, and why insider tips are both tempting and a bad idea.

## Running it

    nvm use
    npm install
    npm run dev

## Developing it

`npm run check` runs formatting, types, lint and the tests. The simulation
in `src/sim` is headless and seeded, so every test and every bug can be
replayed from a seed. See `CLAUDE.md` for how the code is laid out.
