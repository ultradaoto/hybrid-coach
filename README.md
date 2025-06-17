# Hybrid-Coach

Hybrid-Coach merges human coaching expertise with local AI capabilities, delivering an engaging, privacy-first coaching experience.

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Create an `.env` file** based on `.env.example` (set `PORT`, `DATABASE_URL`, etc.).
3. **Run in development mode**
   ```bash
   npm run dev
   ```
4. **Run tests**
   ```bash
   npm test
   ```

The server will start on `http://localhost:3000` by default with a landing page and `/healthz` endpoint.

## Project Structure (M0)
```
├── src
│   ├── app.js          # Express entry point
│   ├── controllers/
│   │   └── homeController.js
│   ├── routes/
│   │   ├── index.js
│   │   └── health.js
│   └── views/
│       ├── layout.ejs
│       ├── index.ejs
│       └── 404.ejs
├── public/
│   └── styles.css
├── tests/
│   └── health.test.js
├── docs/
│   └── PROJECT_PLAN.md
└── .cursorrules
```

## Next Milestones
Refer to `docs/PROJECT_PLAN.md` for the complete roadmap and backlog.

## Environment variables

Create a `.env` file based on the sample below:

```bash
PORT=3000
NODE_ENV=development
SESSION_SECRET=supersecret

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

Generate OAuth credentials in Google Cloud Console (OAuth 2.0 Client ID for a Web application) and whitelist the callback URL.

## Database

This project uses PostgreSQL via Prisma ORM.

1. Set `DATABASE_URL` in your `.env`, for example:
   ```bash
   DATABASE_URL="postgresql://user:password@localhost:5432/hybridcoach"
   ```
2. Install the database client and run migrations:
   ```bash
   npm run generate   # generates Prisma client
   npm run migrate    # creates DB schema (migration name: init)
   ``` 

   Start Claude with wsl -d Ubuntu, and then run claude
   