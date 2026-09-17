# Tracify

**Tracify** is a blockchain investigation and financial intelligence platform that turns fragmented on-chain data into traceable, investigation-ready intelligence for analysts and compliance teams.

## Features

- Case management for organizing investigations
- Wallet & transaction tracing across multiple hops
- Findings and evidence vault
- Investigation workspace with graph canvas and contextual inspector
- Role-based access (Investigator / Admin)

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query & Router, Zustand
- **Backend:** Node.js, Express, Supabase
- **Auth:** JWT + Supabase Auth

## Getting Started

Requires Node.js 18+ and npm (or bun).

```sh
git clone https://github.com/Archiiii23/Tracify.git
cd Tracify
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | Lint the codebase |
| `npm run format` | Format with Prettier |

## Project Structure

```
trace-insight/
├── src/         # Frontend (React + Vite)
├── server/      # Backend API
├── supabase/    # Supabase config & migrations
└── public/      # Static assets
```

## License

Proprietary — all rights reserved.
