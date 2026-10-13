// categorize.js — guess an expense's category from its title.
//
// Two sources, in order of trust:
//   1. YOUR OWN HISTORY — if you've logged this title before, reuse the category
//      you picked then. Your habits beat any keyword list we could ship.
//   2. BUILT-IN KEYWORDS — sensible starting patterns for common merchants.
//
// A guess is only ever offered if that category still exists in the user's list,
// so renaming or deleting a category can never make this pick a ghost.

// Categories the app drives itself — never guessed for an expense.
const NEVER_GUESS = ['Income', 'Reimbursement', 'Adjustment'];

// Order matters: the first rule that matches wins, so put the specific
// patterns above the broad ones ("whole foods" before "food").
const KEYWORD_RULES = [
  // --- Groceries (before Food, so "grocery store" isn't read as a restaurant)
  { re: /\b(grocer\w*|supermarket|whole ?foods|trader joe|safeway|kroger|aldi|lidl|costco|sam'?s club|walmart|target|wegmans|publix|h-?e-?b|ralphs|vons|albertsons|food ?lion|sprouts|fresh market|99 ranch|h ?mart|asian market|farmer'?s market|produce|bodega|7-?eleven|convenience)\b/i, category: 'Groceries' },

  // --- Food & drink
  { re: /\b(restaurant|diner|bistro|eatery|cafe|café|coffee|espresso|latte|starbucks|dunkin|peet'?s|blue bottle|tea ?house|boba|bubble tea|brunch|lunch|dinner|breakfast|takeout|take-?out|delivery|doordash|ubereats|uber eats|grubhub|postmates|seamless|caviar|deliveroo|ramen|noodle|pho|sushi|sashimi|izakaya|pizza|pizzeria|burger|taco|taqueria|burrito|chipotle|sandwich|deli|bbq|barbecue|steakhouse|buffet|dim sum|hot pot|korean bbq|thai|indian food|curry|bakery|pastr\w*|donut|doughnut|croissant|ice cream|gelato|frozen yogurt|smoothie|juice bar|snack|food court|mcdonald|wendy|kfc|subway sandwich|panera|shake shack|five guys|in-?n-?out|chick-?fil-?a|popeyes|taco bell|sweetgreen|cava)\b/i, category: 'Food' },

  // --- Transport
  { re: /\b(uber|lyft|taxi|cab|rideshare|metro|subway fare|mta|bart|caltrain|amtrak|train|rail|bus fare|transit|clipper|charlie ?card|oyster|octopus card|ez-?pass|toll|parking|garage|meter|gas station|gasoline|petrol|fuel|shell|chevron|exxon|mobil|bp |arco|citgo|speedway|ev charg\w*|tesla supercharg\w*|chargepoint|bike share|citi ?bike|lime|bird scooter|scooter|car wash|oil change|tire|mechanic|auto repair|dmv|registration|smog)\b/i, category: 'Transport' },

  // --- Home / Rent
  { re: /\b(rent|landlord|lease|mortgage|hoa|property tax|maintenance fee|building fee|moving|movers|storage unit|furniture|ikea|wayfair|home depot|lowe'?s|hardware store|cleaning service|housekeep\w*|plumber|electrician|handyman|pest control|lawn|gardener|laundry|laundromat)\b/i, category: 'Home/Rent' },

  // --- Bills & utilities
  { re: /\b(bill|utilit\w*|electric\w*|power company|gas bill|water bill|sewer|trash|garbage|internet|broadband|wifi|comcast|xfinity|spectrum|verizon|at&?t|t-?mobile|sprint|phone bill|cell ?phone|mobile plan|cable|insurance premium|renters insurance|car insurance|subscription|icloud|google one|dropbox|aws|domain|hosting|vpn|chatgpt|openai|claude|anthropic|github|notion|adobe|microsoft 365|office 365)\b/i, category: 'Bills' },

  // --- Health
  { re: /\b(doctor|physician|clinic|hospital|urgent care|er visit|dentist|dental|orthodont\w*|optometr\w*|eye exam|glasses|contacts|pharmac\w*|cvs|walgreens|rite ?aid|duane reade|prescription|rx\b|medicine|medication|vitamin|supplement|therapy|therapist|counsel\w*|psychiatr\w*|copay|co-?pay|deductible|lab work|blood test|x-?ray|mri|vaccine|flu shot|chiropract\w*|physical therapy|acupuncture|gym|fitness|yoga|pilates|peloton|planet fitness|equinox|crossfit)\b/i, category: 'Health' },

  // --- Fun & entertainment
  { re: /\b(movie|cinema|theater|theatre|amc|regal|imax|concert|gig|festival|show|museum|gallery|exhibit|zoo|aquarium|theme park|amusement|disney|universal studios|bowling|arcade|mini golf|karaoke|escape room|club|bar\b|pub|brewery|brewpub|cocktail|wine bar|happy hour|netflix|hulu|disney\+|hbo|max\b|prime video|paramount|peacock|apple tv|spotify|apple music|youtube premium|twitch|steam|playstation|xbox|nintendo|game pass|video game|book\b|books|bookstore|kindle|audible|podcast|hobby|board game|concert ticket|ticketmaster|stubhub|eventbrite)\b/i, category: 'Fun' },

  // --- Travel
  { re: /\b(flight|airfare|airline|airplane|plane ticket|united|delta|american airlines|southwest|jetblue|alaska air|lufthansa|emirates|ryanair|easyjet|baggage|checked bag|seat selection|hotel|motel|hostel|airbnb|vrbo|booking\.com|expedia|hotels\.com|marriott|hilton|hyatt|ihg|resort|rental car|hertz|avis|enterprise|budget rent|car rental|cruise|visa fee|passport|travel insurance|esim|roaming|tour|excursion|sightseeing|souvenir|vacation|trip\b|holiday)\b/i, category: 'Travel' },

  // --- Shopping
  { re: /\b(amazon|ebay|etsy|aliexpress|temu|shein|shop\w*|mall|outlet|clothes|clothing|apparel|shirt|pants|jeans|dress|jacket|coat|shoes|sneakers|boots|nike|adidas|uniqlo|zara|h&?m|gap\b|old navy|nordstrom|macy'?s|tj ?maxx|marshalls|ross\b|primark|lululemon|accessor\w*|jewelry|watch\b|handbag|purse|backpack|wallet|sunglasses|cosmetics|makeup|skincare|sephora|ulta|salon|haircut|barber|nails|manicure|spa\b|massage|electronics|best buy|apple store|laptop|headphones|airpods|charger|cable\b|phone case|stationery|office supplies|staples)\b/i, category: 'Shopping' },

  // --- Gifts
  { re: /\b(gift|present|birthday|anniversary|wedding|baby shower|graduation|donation|charity|tip\b|gratuity|flowers|card for|holiday gift|christmas|hanukkah|red envelope|ang ?pao|lucky money)\b/i, category: 'Gifts' },
];

// "  Ramen  BAR!! " -> "ramen bar"
function normalize(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // drop punctuation/emoji, keep letters & digits
    .replace(/\s+/g, ' ')
    .trim();
}

// Most recent first, so the newest decision about a title wins.
function byRecencyDesc(a, b) {
  if (a.date !== b.date) return String(b.date).localeCompare(String(a.date));
  return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
}

// Has the user logged this title before? Returns their category or null.
// Exact match first; then substring, so "Ramen Bar #2" still finds "ramen bar".
function fromHistory(norm, data, allowed) {
  const past = (data.transactions || [])
    .filter((t) => t.kind === 'expense' && t.note && t.category && allowed.has(t.category))
    .sort(byRecencyDesc);

  for (const t of past) {
    if (normalize(t.note) === norm) return t.category;
  }
  // Substring needs a bit of signal — two characters match far too much.
  if (norm.length < 3) return null;
  for (const t of past) {
    const other = normalize(t.note);
    if (other.length < 3) continue;
    if (other.includes(norm) || norm.includes(other)) return t.category;
  }
  return null;
}

function fromKeywords(norm, allowed) {
  for (const rule of KEYWORD_RULES) {
    if (allowed.has(rule.category) && rule.re.test(norm)) return rule.category;
  }
  return null;
}

/**
 * Guess an expense category from its title.
 * @returns {{ category: string, via: 'history'|'keyword' } | null} null when nothing matches.
 */
export function guessCategory(title, data) {
  const norm = normalize(title);
  if (!norm) return null;

  // Only ever suggest a category the user actually has, and never a managed one.
  const allowed = new Set(
    (data.categories || [])
      .map((c) => c.name)
      .filter((name) => !NEVER_GUESS.includes(name)),
  );
  if (!allowed.size) return null;

  const learned = fromHistory(norm, data, allowed);
  if (learned) return { category: learned, via: 'history' };

  const matched = fromKeywords(norm, allowed);
  if (matched) return { category: matched, via: 'keyword' };

  return null;
}
