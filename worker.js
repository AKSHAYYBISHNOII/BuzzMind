/**
 * BUZZmind backend proxy — Cloudflare Worker
 * ---------------------------------------------------------------
 * This is the missing piece that makes the AI button on the site
 * actually work. The browser can NEVER call api.anthropic.com
 * directly (no CORS support, and it would expose your secret API
 * key to anyone who views the page source). This tiny server-side
 * function sits in between: the browser calls THIS worker, and
 * THIS worker calls Anthropic using a key that stays secret.
 *
 * DEPLOY STEPS (free, ~5 minutes):
 * 1. Go to https://dash.cloudflare.com -> sign up / log in (free plan is fine)
 * 2. Workers & Pages -> Create -> Create Worker
 * 3. Give it a name, e.g. "buzzmind-proxy" -> Deploy
 * 4. Click "Edit code", delete the placeholder code, paste in this
 *    entire file, then click "Deploy" again.
 * 5. Go to Settings -> Variables -> add an Environment Variable:
 *      Name:  ANTHROPIC_API_KEY
 *      Value: <your real key from console.anthropic.com>
 *    Make sure to click "Encrypt" so it's stored as a secret.
 * 6. Copy the worker's URL (looks like
 *    https://buzzmind-proxy.YOUR-SUBDOMAIN.workers.dev)
 * 7. Paste that URL into the API_ENDPOINT constant near the top of
 *    the <script> section in index.html, then commit + push.
 */

export default {
  async fetch(request, env) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    let thought;
    try {
      const body = await request.json();
      thought = (body.thought || '').toString().trim();
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }

    if (!thought) {
      return jsonResponse({ error: 'Missing "thought" field' }, 400);
    }
    if (thought.length > 2000) {
      return jsonResponse({ error: 'Thought is too long' }, 400);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return jsonResponse(
        { error: 'Server is missing ANTHROPIC_API_KEY. Set it in Worker settings.' },
        500
      );
    }

    try {
      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          system:
            'You output ONLY raw valid JSON with no explanation, no markdown, no code fences, no preamble. Your entire response must be a single JSON object parsable directly by JSON.parse().',
          messages: [
            {
              role: 'user',
              content:
                'Convert this thought into a structured action plan: ' +
                JSON.stringify(thought) +
                '\n\nReturn a JSON object with exactly these fields:\n' +
                '- summary: string (one-line rewrite of the goal)\n' +
                '- tasks: array of 5 objects each with title, description, time (like "9:00 AM"), duration (like "30 min")\n' +
                '- reminders: array of 4 objects each with time (like "8:00 AM") and text\n' +
                '- roadmap: array of 4 objects each with week (like "Week 1"), title, description, status ("current" for first, "upcoming" for rest)\n' +
                '- habits: array of 3 objects each with name\n' +
                '- nudges: array of 3 objects each with icon (single emoji), title, desc'
            }
          ]
        })
      });

      const data = await anthropicRes.json();

      if (!anthropicRes.ok) {
        return jsonResponse(
          { error: data.error?.message || 'Anthropic API error' },
          anthropicRes.status
        );
      }

      const raw = (data.content || []).map((c) => c.text || '').join('');
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        return jsonResponse({ error: 'No JSON object found in model response' }, 502);
      }

      let plan;
      try {
        plan = JSON.parse(match[0]);
      } catch {
        return jsonResponse({ error: 'Model returned malformed JSON' }, 502);
      }

      return jsonResponse(plan, 200);
    } catch (err) {
      return jsonResponse({ error: 'Unexpected server error: ' + err.message }, 500);
    }
  }
};

function corsHeaders() {
  return {
    // For tighter security, replace '*' with your actual GitHub Pages
    // origin, e.g. 'https://yourusername.github.io'
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}
