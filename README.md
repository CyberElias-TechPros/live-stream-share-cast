# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/63882c30-05f5-42b6-baf0-ed1039effda3

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/63882c30-05f5-42b6-baf0-ed1039effda3) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

**Backend:** [Cloudflare Workers](./worker/README.md) — D1 (database), R2 (recordings & avatars), Durable Objects (live chat, presence, WebRTC signalling) and Cron Triggers (cleanup). Auth is first-party (PBKDF2 + JWT).

## Running the full stack locally

Two processes: the Worker API on `:8787` and Vite on `:8080` (which proxies `/api`).

```bash
# 1 — API (terminal 1)
cd worker
npm install
cp .dev.vars.example .dev.vars     # set JWT_SECRET
npm run db:migrate:local           # create the D1 schema locally
npm run seed                       # optional demo users + streams
npm run dev

# 2 — App (terminal 2)
npm install
cp .env.example .env
npm run dev                        # http://localhost:8080
```

Demo accounts created by `npm run seed` (password `demo1234`):
`aria@demo.live`, `nova@demo.live`, `kai@demo.live`, `viewer@demo.live`.

Full API reference, architecture notes and deploy steps live in
[`worker/README.md`](./worker/README.md).

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/63882c30-05f5-42b6-baf0-ed1039effda3) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)
