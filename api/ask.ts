// Vercel serverless function behind the Ask page.
//
// It never sees your transactions. The app sends only the question, today's date and the
// names it can search by (categories, subcategories, places and payers). Claude turns the
// question into a small search (what to match, which dates, what to add up), and the app
// runs that search on your own data and does the maths itself.
//
// Needs ANTHROPIC_API_KEY set in the Vercel project's environment variables.
// Only signed-in WealthWise users can call it (the Supabase session is checked first).

import Anthropic from '@anthropic-ai/sdk';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://tpmhckmqccwbhohggvau.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwbWhja21xY2N3YmhvaGdndmF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxOTA1ODAsImV4cCI6MjA4NTc2NjU4MH0.F32n8KkONsovim08FE1MjK0NufSfUWsEtixCYCMPP_Y';
const MODEL = 'claude-sonnet-5-5';

// strict: the model's arguments always match this schema (every field required; unused ones are
// empty strings). This model can't be forced to call a tool, so the prompt asks for it instead.
const SEARCH_TOOL = {
  name: 'search',
  description: "Describe the search over the user's transactions that answers their question. Always call this tool, exactly once.",
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      metric: {
        type: 'string',
        enum: ['total', 'count', 'average', 'per_month', 'per_week', 'per_day', 'by_month', 'by_day', 'biggest_payment', 'biggest_day', 'compare', 'on_track', 'suggest_budget', 'budget_left', 'net', 'unsupported'],
        description: 'total = add up amounts; count = how many payments; average = average payment (per payment); per_month / per_week / per_day = the total spread over the months / weeks / days in the range ("how much a month", "per week", "monthly average", "on average each month"); by_month / by_day = the total split into each month / each day ("each month", "month by month", "break it down by month", "each day this week"); biggest_payment = the single largest payment; biggest_day = the day with the highest total; compare = total in range A vs range B; on_track = how this month is going against a usual month, with a month-end projection; suggest_budget = a sensible monthly budget from recent months; budget_left = what is left of a budget the user names (budget_amount) and how much a day that leaves; net = money in minus money out (what they saved); unsupported = the question cannot be answered from transactions.',
      },
      direction: { type: 'string', enum: ['out', 'in', 'both'], description: 'out = spending, in = money received. Default out unless the question is about being paid, income, refunds or money in.' },
      places: { type: 'array', items: { type: 'string' }, description: 'Exact names from the PLACES/PAYERS lists to match. Empty for any.' },
      categories: { type: 'array', items: { type: 'string' }, description: 'Exact category names from CATEGORIES. Empty for any.' },
      subcategories: { type: 'array', items: { type: 'string' }, description: 'Exact subcategory names from CATEGORIES. Empty for any.' },
      start: { type: 'string', description: 'First day, YYYY-MM-DD.' },
      end: { type: 'string', description: 'Last day, YYYY-MM-DD (inclusive).' },
      compare_start: { type: 'string', description: 'For compare: first day of the period to compare against (YYYY-MM-DD). Empty string otherwise.' },
      compare_end: { type: 'string', description: 'For compare: last day of the period to compare against (YYYY-MM-DD). Empty string otherwise.' },
      title: { type: 'string', description: 'Short label for what is measured, e.g. "Uber · August 2026" or "Food · 2026 vs 2025".' },
      understood: { type: 'string', description: 'One plain-English sentence restating the search, e.g. "Spending at Uber from 1 to 31 August 2026".' },
      reason: { type: 'string', description: 'For unsupported only: a short, friendly reason. Empty string otherwise.' },
      budget_amount: { type: 'number', description: 'For budget_left: the budget the user gave, in their own currency (e.g. 500 for "I have £500 for food"). 0 otherwise.' },
    },
    required: ['metric', 'direction', 'places', 'categories', 'subcategories', 'start', 'end', 'compare_start', 'compare_end', 'title', 'understood', 'reason', 'budget_amount'],
    additionalProperties: false,
  },
} as const;

const list = (v: unknown, max: number) => (Array.isArray(v) ? v.filter(x => typeof x === 'string').map(x => x.slice(0, 80)).slice(0, max) : []);

export default async function handler(req: any, res: any) {
  try {
    await answer(req, res);
  } catch (err) {
    console.error('Ask failed:', err);
    if (!res.headersSent) res.status(500).json({ error: `Ask hit an error: ${String((err as Error)?.message || err).slice(0, 200)}` });
  }
}

async function answer(req: any, res: any) {
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
  // Earlier questions in a search-box chat, so a follow-up ("and last month?") can lean on them
  const history = list(body.history, 3).map(h => h.slice(0, 300));

  // The lists of names only change when you import, so they go first and are cached; today's date
  // and the question come after the cache point.
  const lists = [
    `You turn a question about someone's personal spending and income into a search over their bank transactions, by calling the search tool. Weeks start on Monday. Currency doesn't matter; the app handles it.`,
    'Only use names that appear in the lists below, copied exactly. Match loosely: "uber" can mean "Uber" and "Uber Eats" if both exist; "food" can mean the Food category. If nothing fits, leave the list empty and rely on the dates and direction.',
    [
      'Dates (always fill start and end, inclusive):',
      '- A single day ("today", "yesterday", "on 3 March", "last Saturday"): start = end = that day.',
      '- "This week" = Monday of this week to today; "last week" = the previous Monday to Sunday; "this weekend" / "last weekend" = that Saturday to Sunday.',
      '- A month by name ("in March", "September") = the whole month; use this year unless that month has not started yet, then last year. "This month" = the 1st to today. "Last month" = the whole previous calendar month.',
      '- Several months ("January to March", "Jan > March", "Jan-Mar", "since March", "Q1", "the last 3 months"): from the 1st of the first month to the end of the last month (or today if it is the current month). "The last N months" counts back from today; "the last N days" = today and the N-1 days before.',
      '- "This year" / "so far this year" = 1 January this year to today. "Last year" = the whole of last year. If no dates are given, use 1 January this year to today.',
      'Pick the metric from the wording: "how much" = total; "per day" / "a day" / "daily average" = per_day; "per month" / "a month" / "monthly average" = per_month; "each month" / "month by month" = by_month; "each day" = by_day; "how many times" = count; "average payment" = average.',
      'Budgeting (the app has no saved budgets, so these work from their history or a figure they give):',
      '- "Am I on track", "on pace", "will I go over", "how am I doing this month" = on_track, with start = 1st of this month and end = the last day of this month.',
      '- "How much should I budget", "what is a good budget", "set a budget for X" = suggest_budget, with start/end = the last 6 full calendar months before this one.',
      '- "I have £X (for Y) this month, how much is left / how much can I spend a day" = budget_left with budget_amount = X and start/end = the whole of that month (this month if not said).',
      '- "How much did I save", "net", "income minus spending", "did I spend more than I earned" = net with direction both.',
    ].join('\n'),
    'For "more/less than last year" questions use compare, with the same days of last year as compare_start/compare_end.',
    `CATEGORIES (subcategories in brackets):\n${categories.join('\n')}`,
    `PLACES (where they spend):\n${places.join(' | ')}`,
    `PAYERS (who pays them):\n${payers.join(' | ')}`,
  ].join('\n\n');

  const client = new Anthropic({ apiKey: key });
  let data: Anthropic.Beta.BetaMessage;
  try {
    data = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // A small, well-defined job: little thinking needed, which keeps it quick and cheap
      output_config: { effort: 'low' },
      // If a safety check declines the question, Anthropic retries it on its recommended model
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        { type: 'text', text: lists, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `Today is ${today}.` },
      ],
      tools: [SEARCH_TOOL],
      messages: [{ role: 'user', content: history.length
        ? `Earlier questions in this conversation (the new one may follow on from them):\n${history.map(h => `- ${h}`).join('\n')}\n\nNew question: ${question}`
        : question }],
    });
  } catch (err) {
    // Shown in Vercel's function logs, and the reason is passed back so the app can show it
    console.error('Anthropic request failed:', err);
    if (err instanceof Anthropic.AuthenticationError) { res.status(503).json({ error: 'The Anthropic API key was not accepted. Check ANTHROPIC_API_KEY in Vercel.' }); return; }
    if (err instanceof Anthropic.PermissionDeniedError) { res.status(503).json({ error: `The Anthropic account can't use this yet: ${err.message}` }); return; }
    if (err instanceof Anthropic.RateLimitError) { res.status(503).json({ error: 'Too many questions at once. Try again in a moment.' }); return; }
    if (err instanceof Anthropic.BadRequestError) {
      const credit = /credit balance/i.test(err.message);
      res.status(502).json({ error: credit ? 'Your Anthropic account is out of credit. Add some in the Claude Console (Billing).' : `The AI service rejected the request: ${err.message.slice(0, 300)}` });
      return;
    }
    if (err instanceof Anthropic.APIError) { res.status(502).json({ error: `The AI service had a problem (${err.status ?? 'no status'}): ${err.message.slice(0, 300)}` }); return; }
    res.status(502).json({ error: `Couldn't reach the AI service: ${String((err as Error)?.message || err).slice(0, 200)}` });
    return;
  }
  if (data.stop_reason === 'refusal') { res.status(200).json({ search: { metric: 'unsupported', reason: "That question couldn't be answered. Try asking another way." } }); return; }
  const use = data.content.find((c): c is Anthropic.Beta.BetaToolUseBlock => c.type === 'tool_use' && c.name === 'search');
  if (!use?.input) { res.status(502).json({ error: "Couldn't understand that one. Try asking another way." }); return; }
  res.status(200).json({ search: use.input });
}
