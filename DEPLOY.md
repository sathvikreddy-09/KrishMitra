# Deploying KrishMitra as a Cloudflare Worker (Static Assets)

## Project layout
```
public/index.html   <- the KrishMitra frontend (unchanged, still calls /api/chat)
src/worker.js        <- Worker entry point: routes /api/chat to OpenAI, serves
                         everything else as static assets
wrangler.jsonc        <- Wrangler config (assets binding + Worker entry point)
.gitignore
.dev.vars.example
```

## 1. Local development (optional)
```
cp .dev.vars.example .dev.vars
```
Edit `.dev.vars` and add your real key (this file is gitignored, never committed):
```
OPENAI_API_KEY=sk-...
```
Then:
```
npx wrangler dev
```
Open the printed local URL. This serves `public/index.html` and runs `src/worker.js` locally, reading `OPENAI_API_KEY` from `.dev.vars`.

## 2. Deploy
```
npx wrangler deploy
```
This publishes both the static frontend and the Worker's `/api/chat` route to your existing Worker (same `0ccef458-krishmitra...workers.dev` URL, since `name` in `wrangler.jsonc` should match your existing Worker's name — if it doesn't, either rename it in `wrangler.jsonc` to match, or this will create a new Worker instead of updating the existing one).

## 3. Set the real secret (if not already set on this exact Worker)
You mentioned you already added `OPENAI_API_KEY` in Cloudflare — just confirm it's attached to **this specific Worker** (the same one this `wrangler.jsonc` deploys to):
1. Cloudflare dashboard → Workers & Pages → your Worker (`krishmitra` / the `0ccef458-...` one).
2. Settings → Variables and Secrets.
3. Confirm `OPENAI_API_KEY` is listed as type **Secret**. If not, add it there, or run:
   ```
   npx wrangler secret put OPENAI_API_KEY
   ```
   (paste your real key when prompted — this sets it directly on the deployed Worker, no dashboard needed).

## 4. If you use GitHub → Cloudflare auto-deploy (Workers Builds)
Commit and push all the files above (everything except what `.gitignore` excludes):
```
git add .
git status   # double check .dev.vars / .env do NOT appear here
git commit -m "Fix /api/chat: correct Workers Static Assets architecture"
git push
```
Cloudflare's Workers Builds will pick up `wrangler.jsonc` automatically on push and redeploy using this same configuration.

## 5. Test it
Visit: `https://0ccef458-krishmitra.sathvikreddypentaparthi.workers.dev/`
- The site itself should load exactly as before (frontend unchanged).
- Open the app, go to "Talk to KrishMitra", and send a message like: **"What crop suits black soil?"**
- You should get a real OpenAI-generated reply, not an error.

If you get `{"error":{"message":"Server is not configured: OPENAI_API_KEY secret is missing."}}`, the secret isn't attached to this Worker yet — go back to step 3.
