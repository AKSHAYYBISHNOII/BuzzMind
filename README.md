# BuzzMind
# BUZZmind

Turn a vague goal or thought into a daily plan, reminders, a week-by-week roadmap, and habit tracking. You type something like "I want to get fit but I keep skipping the gym" and it breaks that down into actual structure.

Single page, dark theme, amber accent. No frameworks, no build step — just HTML/CSS/JS and a small backend proxy for the AI calls.

## How it works

The frontend (`index.html`) collects whatever you type into the text box and sends it to a backend endpoint. That backend (`worker.js`, deployed as a Cloudflare Worker) calls the Anthropic API with your key and asks for a JSON-structured plan back: a list of tasks with times, some reminders, a roadmap broken into weeks, habits to track, and a few nudges. The frontend then renders all of that into the cards you see below the input box.

The reason there's a separate backend at all: you can't call the Anthropic API straight from browser JS. There's no CORS support for that, and you'd be shipping your API key in plain text to anyone who opens dev tools. So the key lives server-side in the worker, and the worker is the only thing that talks to Anthropic.

```
browser (index.html) -> worker.js (holds the API key) -> Anthropic API
```

## Files

- `index.html` — the whole site. Styles and JS are inline, no separate files to manage.
- `worker.js` — Cloudflare Worker that proxies requests to Anthropic. This is where the API key actually lives.
- `.gitignore`, `LICENSE` — the usual.

## Running it locally

```bash
python3 -m http.server 8000
```

Then open `localhost:8000`. The page loads fine on its own, but hitting "Convert" won't do anything until `API_ENDPOINT` in `index.html` points at a real deployed worker — there's no way around that locally since the API key can't sit in this file.

## Deploying

Two pieces: the worker (backend) and the static site (frontend). Do the worker first since you need its URL for the frontend.

**Worker / backend:**

1. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com) (free tier is enough).
2. Workers & Pages → Create → Create Worker. Call it whatever, e.g. `buzzmind-proxy`.
3. Edit the code, paste in everything from `worker.js`, deploy.
4. In the worker's settings, add an environment variable `ANTHROPIC_API_KEY` with your real key from console.anthropic.com. Encrypt it.
5. Grab the worker's URL — something like `buzzmind-proxy.yoursubdomain.workers.dev`.

**Frontend:**

1. In `index.html`, find `API_ENDPOINT` near the top of the script tag and swap in the worker URL from above.
2. Push the repo to GitHub.
3. Repo settings → Pages → deploy from `main`, root folder.
4. Site's live at `yourusername.github.io/reponame`.

That's it. Once both are wired up the Convert button actually talks to Claude and the key never touches the browser.

## Things to keep in mind

- Cloudflare's free tier gives you 100k requests/day on the worker, which is way more than you'll need starting out. Anthropic billing is separate, on your API usage.
- CORS on the worker is currently wide open (`*`). Once you know your GitHub Pages URL, tighten that in `worker.js` so only your domain can call it.
- If the AI ever returns something that's not valid JSON, the frontend will throw a toast error instead of breaking silently — that's intentional, not a bug to fix.
