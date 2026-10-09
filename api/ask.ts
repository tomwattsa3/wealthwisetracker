// Vercel serverless function behind the Ask page.
//
// It never sees your transactions. The app sends only the question, today's date and the
// names it can search by (categories, subcategories, places and payers). Claude turns the
// question into a small search (what to match, which dates, what to add up), and the app
// runs that search on your own data and does the maths itself.
//
// Needs ANTHROPIC_API_KEY set in the Vercel project's environment variables.
// Only signed-in WealthWise users can call it (the Supabase session is checked first).

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://tpmhckmqccwbhohggvau.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwbWhja21xY2N3YmhvaGdndmF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxOTA1ODAsImV4cCI6MjA4NTc2NjU4MH0.F32n8KkONsovim08FE1MjK0NufSfUWsEtixCYCMPP_Y';
const MODEL = 'claude-sonnet-5-5';

const SEARCH_TOOL = {
  name: 'search',
  description: "Describe the search over the user's transactions that answers their question.",
  input_schema: {
    type: 'object',
    properties: {
      metric: {
        type: 'string',
        enum: ['total', 'count', 'average', 'biggest_payment', 'biggest_day', 'compare', 'unsupported'],
        description: 'total = add up amounts; count = how many payments; average = average payment; biggest_payment = the single largest payment; biggest_day = the day with the highest total; compare = total in range A vs range B; unsupported = the question cannot be answered from transactions.',
      },
      direction: { type: 'string', enum: ['out', 'in', 'both'], description: 'out = spending, in = money received. Default out unless the question is about being paid, income, refunds or money in.' },
      places: { type: 'array', items: { type: 'string' }, description: 'Exact names from the PLACES/PAYERS lists to match. Empty for any.' },
      categories: { type: 'array', items: { type: 'string' }, description: 'Exact category names from CATEGORIES. Empty for any.' },
      subcategories: { type: 'array', items: { type: 'string' }, description: 'Exact subcategory names from CATEGORIES. Empty for any.' },
      start: { type: 'string', description: 'First day, YYYY-MM-DD.' },
      end: { type: 'string', description: 'Last day, YYYY-MM-DD (inclusive).' },
      compare_start: { type: 'string', description: 'For compare: first day of the period to compare against.' },
      compare_end: { type: 'string', description: 'For compare: last day of the period to compare against.' },
      title: { type: 'string', description: 'Short label for what is measured, e.g. "Uber · August 2026" or "Food · 2026 vs 2025".' },
      understood: { type: 'string', description: 'One plain-English sentence restating the search, e.g. "Spending at Uber from 1 to 31 August 2026".' },
      reason: { type: 'string', description: 'For unsupported only: a short, friendly reason.' },
    },
    required: ['metric', 'direction', 'places', 'categories', 'subcategories', 'start', 'end', 'title', 'understood'],
  },
};

const list = (v: unknown, max: number) => (Array.isArray(v) ? v.filter(x => typeof x === 'string').map(x => x.slice(0, 80)).slice(0, max) : []);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST' }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(503).json({ error: 'not_configured' }); return; }

  // Signed-in users only
  const auth = String(req.headers?.authorization || '');
  if (!auth.startsWith('Bearer ')) { res.status(401).json({ error: 'Sign in first' }); return; }
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: auth } });
  if (!who.ok) { res.status(401).json({ error: 'Sign in first' }); return; }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const question = String(body.question || '').trim().slice(0, 300);
  if (!question) { res.status(400).json({ error: 'Ask a question' }); return; }
  const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
  const categories = Array.isArray(body.categories)
    ? body.categories.slice(0, 60).map((c: any) => `${String(c?.name || '').slice(0, 60)}${Array.isArray(c?.subs) && c.subs.length ? ` (${list(c.subs, 40).join(', ')})` : ''}`)
    : [];
  const places = list(body.places, 400);
  const payers = list(body.payers, 150);

  const system = [
    `You turn a question about someone's personal spending and income into a search over their bank transactions. Today is ${today}. Weeks start on Monday. Currency doesn't matter; the app handles it.`,
    'Only use names that appear in the lists below, copied exactly. Match loosely: "uber" can mean "Uber" and "Uber Eats" if both exist; "food" can mean the Food category. If nothing fits, leave the list empty and rely on the dates and direction.',
    '"This year" means 1 January this year to today. "Last month" means the whole previous calendar month. If no dates are given, use 1 January this year to today.',
    'For "more/less than last year" questions use compare, with the same days of last year as compare_start/compare_end.',
    `CATEGORIES (subcategories in brackets):\n${categories.join('\n')}`,
    `PLACES (where they spend):\n${places.join(' | ')}`,
    `PAYERS (who pays them):\n${payers.join(' | ')}`,
  ].join('\n\n');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      system,
      tools: [SEARCH_TOOL],
      tool_choice: { type: 'tool', name: 'search' },
      messages: [{ role: 'user', content: question }],
    }),
  });
  if (!r.ok) { res.status(502).json({ error: 'The AI service did not answer. Try again in a moment.' }); return; }
  const data: any = await r.json();
  const use = Array.isArray(data?.content) ? data.content.find((c: any) => c?.type === 'tool_use') : null;
  if (!use?.input) { res.status(502).json({ error: "Couldn't understand that one. Try asking another way." }); return; }
  res.status(200).json({ search: use.input });
}
