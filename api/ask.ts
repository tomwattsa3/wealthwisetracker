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
        enum: ['total', 'count', 'average', 'per_month', 'per_week', 'per_day', 'by_month', 'by_day', 'biggest_payment', 'biggest_day', 'compare', 'on_track', 'suggest_budget', 'budget_left', 'net',
          'compare_groups', 'top', 'list', 'last_payment', 'share_of_income', 'net_by_month', 'what_if', 'projection', 'duplicates', 'new_places', 'unsupported'],
        description: 'total = add up amounts; count = how many payments; average = average payment (per payment); per_month / per_week / per_day = the total spread over the months / weeks / days in the range ("how much a month", "per week", "monthly average", "on average each month"); by_month / by_day = the total split into each month / each day ("each month", "month by month", "break it down by month", "each day this week"); biggest_payment = the single largest payment; biggest_day = the day with the highest total; compare = total in range A vs range B; on_track = how this month is going against a usual month, with a month-end projection; suggest_budget = a sensible monthly budget from recent months; budget_left = what is left of a budget the user names (budget_amount) and how much a day that leaves; net = money in minus money out (what they saved); compare_groups = two or more things side by side over the same dates (fill groups); top = a ranking (fill group_by, rank, rank_by, limit); list = show the matching payments; last_payment = when they last paid; share_of_income = the matched spending as a % of income over the same dates; net_by_month = money in minus out for each month (savings rate, months they overspent); what_if = yearly saving from changing the matched spending by change_pct; projection = where the total will end up by the end date at the pace so far; duplicates = possible double charges (same place, amount and day); new_places = places paid for the first time in the range; unsupported = the question cannot be answered from transactions.',
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
      groups: {
        type: 'array',
        description: 'For compare_groups: each thing to compare, with its own names. Empty array otherwise.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Short name to show, e.g. "Meals Out".' },
            places: { type: 'array', items: { type: 'string' } },
            categories: { type: 'array', items: { type: 'string' } },
            subcategories: { type: 'array', items: { type: 'string' } },
          },
          required: ['label', 'places', 'categories', 'subcategories'],
          additionalProperties: false,
        },
      },
      group_by: { type: 'string', enum: ['', 'category', 'subcategory', 'place', 'month', 'weekday', 'day', 'payment', 'bank'], description: 'For top: what to rank. payment = individual transactions. Empty string otherwise.' },
      rank: { type: 'string', enum: ['top', 'bottom'], description: 'For top: top = highest first, bottom = lowest first ("cheapest month"). Use top otherwise.' },
      rank_by: { type: 'string', enum: ['amount', 'count', 'average'], description: 'For top: amount = money, count = how often ("most often", "most visited"), average = average per payment, or per day for weekdays ("what do I usually spend on Fridays"). Use amount otherwise.' },
      limit: { type: 'number', description: 'For top: how many (e.g. 5 for "top 5"). 5 if not said. 0 otherwise.' },
      min_amount: { type: 'number', description: 'Only payments of at least this much ("over £200"). 0 for no limit.' },
      max_amount: { type: 'number', description: 'Only payments of at most this much ("under £10"). 0 for no limit.' },
      weekdays: { type: 'array', items: { type: 'integer' }, description: 'Only these days of the week, 1 = Monday … 7 = Sunday ("on Fridays" = [5], "weekends" = [6, 7]). Empty for any.' },
      days_of_month: { type: 'array', items: { type: 'integer' }, description: 'Only these days of the month ("on the 1st" = [1], "first week of each month" = [1..7]). Empty for any.' },
      include_hidden: { type: 'boolean', description: 'true when the question is about payments left out of spending totals: refunds, transfers, credit card payments, reimbursements, duplicates, loans, debt payments, or anything in a category marked (not counted). false otherwise.' },
      uncategorised: { type: 'boolean', description: 'true only for "uncategorised" / "not categorised" payments.' },
      change_pct: { type: 'number', description: 'For what_if: the change as a percentage, e.g. -50 for "cut by half", -100 for "stop". 0 otherwise.' },
    },
    required: ['metric', 'direction', 'places', 'categories', 'subcategories', 'start', 'end', 'compare_start', 'compare_end', 'title', 'understood', 'reason', 'budget_amount',
      'groups', 'group_by', 'rank', 'rank_by', 'limit', 'min_amount', 'max_amount', 'weekdays', 'days_of_month', 'include_hidden', 'uncategorised', 'change_pct'],
    additionalProperties: false,
  },
} as const;

// How to read the kinds of question people ask, with worked examples. Kept in the cached part of
// the prompt. Names in the examples are illustrations; always use the user's own lists.
const MASTER = `How to answer the common kinds of question (fill every field; unused ones are "" / [] / 0 / false):

1. One category, subcategory or place over a period → total.
   "How much did I spend on Food last month?" → total, categories [Food], last month.
   "What's my total on Meals Out this year?" → total, subcategories [Meals Out].
   "Uber/Taxi in the last 30 days" → total, subcategories [Uber/Taxi], today and the 29 days before.
   A name can be both a category and a subcategory (e.g. Food, or Clothes / Amazon / Dentist in two categories): if they name the parent too ("Clothes in Shopping"), use groups; otherwise match the subcategory everywhere it appears.

2. Two or more things side by side → compare_groups, one group per thing, same dates.
   "Food Delivery vs Meals Out last month" → groups [{label Food Delivery, subcategories [Food Delivery]}, {label Meals Out, subcategories [Meals Out]}].
   "Uber/Taxi compared with Fuel and Parking combined" → groups [{Uber/Taxi}, {label "Fuel + Parking", subcategories [Fuel, Parking]}].
   "Amazon under Shopping vs Amazon under Personal" → groups [{label "Amazon · Shopping", categories [Shopping], subcategories [Amazon]}, {label "Amazon · Personal", categories [Personal], subcategories [Amazon]}].
   "Shell vs BP" / "ChatGPT vs Claude" → groups with places.
   "Groceries vs Food: am I eating out more than cooking?" → groups: groceries (the grocery subcategories) vs eating out (meals out, delivery).
   For "combined total" questions still use compare_groups; the answer shows the total too.

3. A specific day or range → list (to show what was bought) or total (if they ask "how much").
   "What did I spend on 14 September?" → list, start = end = 14 Sep. "Yesterday", "last weekend", "1 to 7 October" the same way.
   "Christmas week last year" → 24–31 Dec last year. "Q3" → 1 Jul – 30 Sep. "Q1" Jan–Mar, "Q2" Apr–Jun, "Q4" Oct–Dec.
   "The first week of each month this year" → total with days_of_month [1..7], this year. "On the 1st of the month" → days_of_month [1].
   "January to June vs July to December" → compare (start/end = Jul–Dec, compare = Jan–Jun).

4. Rankings → top with group_by.
   "Top 5 categories this month" → top, group_by category, limit 5. "Top 10 merchants this year" → group_by place, limit 10.
   "Biggest 10 transactions in the last 90 days" → top, group_by payment, limit 10.
   "Which restaurant have I spent the most at?" → top, group_by place, subcategories [Meals Out], limit 5.
   "Which merchant do I visit most often?" → top, group_by place, rank_by count.
   "Most expensive month this year" → top, group_by month, limit 1. "Cheapest month" → same with rank bottom.
   "Rank my Housing subcategories" → top, group_by subcategory, categories [Housing], limit 10.
   "Which day of the week do I spend the most on?" → top, group_by weekday, rank_by average, limit 7.
   "Fridays vs Mondays" → top, group_by weekday, rank_by average, weekdays [5, 1].
   "Biggest single day" → biggest_day. "Which category grew the most compared to last month?" → compare (this month vs last month); the answer lists the biggest changes.

5. Merchants.
   "How many times did I order from Talabat in September?" → count, places [Talabat].
   "Average spend per Talabat order" → average. "When did I last pay at the barber?" → last_payment (use the Haircuts subcategory or the barber's name).
   "Show every transaction at Tesco in 2026" → list. "Grab, rides vs food" → compare_groups by subcategory with places [Grab].

6. Trends and averages.
   "Average monthly spend on Food" → per_month. "Average weekly grocery spend" → per_week. "Average daily spend" → per_day, no names.
   "Is X going up or down?" / "how has X changed month by month" / "month-by-month breakdown" → by_month over this year (or the last 6–12 months).
   "Average cost per meal out" → average. "Run rate for this month" → on_track. "On current pace, what will I spend on Food this year?" → projection, start 1 Jan, end 31 Dec.
   "Is my subscription total higher than 6 months ago?" → compare (this month vs the same month 6 months ago).

7. Subscriptions and recurring payments: use the subscription categories/subcategories by name.
   "List my subscriptions and what they cost" → top, group_by place, the subscription categories, rank_by amount, limit 15, over the last 3 months.
   "Total monthly subscription bill" → per_month over the last 3 full months. "Annual cost of my Apple charges" → total over the last 12 months, places [Apple].
   "Which subscriptions renewed this month?" → list this month with the subscription categories. "New subscriptions in the last 3 months" → new_places with the subscription categories.
   Price rises and "paying twice for the same subscription" can't be judged reliably: use top by place over 6 months so they can see it, and say so in understood.

8. Checks.
   "Unusually large transactions" / "over £200 this month" → list with min_amount (200 if not said). "Charged twice?" → duplicates.
   "Marked as Duplicate" / "Random Expenses I should recategorise" → list with those names (include_hidden for hidden ones). "Uncategorised" → list, uncategorised true.
   "Fines this year, and what for" → list, subcategories [Fines]. "Merchants I've never used before" → new_places.
   "Foreign currency transactions with high fees" → list, subcategories [Currency Exchange Fees].

9. Money left out of spending (refunds, transfers, credit card payments, reimbursements, loans, debt payments): set include_hidden true.
   "Refunds this year" → total, include_hidden, the refunds subcategory, direction both. "Net Amazon after refunds" → compare_groups (Amazon spending vs Amazon refunds, direction both).
   "Spending excluding transfers and card payments" → total with no names and include_hidden false (they're already left out).

10. Income and cash flow.
   "Total income last month" → total, direction in. "Income vs spending this month" → net. "Savings Interest this year" → total, direction in, that subcategory.
   "What % of my income goes on Housing?" → share_of_income, categories [Housing]. "Savings rate per month" / "which month did I spend more than I earned" → net_by_month. "Left over after spending in September" → net.

11. What if.
   "Cut Food Delivery by half: how much a year?" → what_if, change_pct -50, over the last 6 full months. "Cancel X" → change_pct -100.
   "Am I over my usual Food spend this month?" → on_track. "What could I cut to save £300 a month?" → top, group_by subcategory, last 3 full months, limit 8 (shows the biggest areas).

Not answerable from transactions alone → unsupported with a short, helpful reason: trips and travel days ("my last trip", "while in the UK", "days I had a flight"), birthdays and personal dates they haven't given, "between my rent payment and…" (ask for the dates), currency split by original currency, and anything needing information the app doesn't have. If they give the dates, answer it.`;

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
    ? body.categories.slice(0, 60).map((c: any) => `${String(c?.name || '').slice(0, 60)}${Array.isArray(c?.subs) && c.subs.length ? ` (${list(c.subs, 40).join(', ')})` : ''}${c?.hidden ? ' [not counted in spending: needs include_hidden]' : ''}`)
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
    'For "more/less than last year" questions use compare, with the same days of last year as compare_start/compare_end. "This October vs last October" = compare with October last year.',
    MASTER,
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
