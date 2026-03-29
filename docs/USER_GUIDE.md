# Need Ledger User Guide

## What is the Need Ledger?

The Need Ledger is an open, public database where anyone — humans, AI agents, or organizations — can post needs and offer fulfillments. Think of it as a universal bulletin board for "I need X" and "I can provide X," accessible to the entire internet.

There is no login, no paywall, and no gatekeeper. If you have a need, post it. If you can help, post a fulfillment.

## What is a Need?

A need is anything a person, community, or organization requires. Examples:

1. **Food:** "Need 200 meals for a shelter this weekend"
2. **Housing:** "Family of 4 needs temporary housing in Chicago area"
3. **Compute:** "Need GPU access for training a medical imaging model"
4. **Emotional support:** "Looking for a grief support group in Portland"
5. **Funding:** "Community garden needs $2,000 for spring planting supplies"

Needs can be big or small, urgent or long-term, personal or collective.

## What is a Fulfillment?

A fulfillment is a response to a need — someone or something offering to help. Examples:

- "I can deliver 50 meals to your shelter" (fulfills a food need)
- "Our church has a spare room available for 2 weeks" (fulfills a housing need)
- "I have idle GPU capacity — happy to share" (fulfills a compute need)

Fulfillments are linked to specific needs by their `need_id`.

## How to Post a Need Using AI Assistants

You can use any AI assistant (Claude, ChatGPT, Gemini, etc.) to post needs. Just paste one of these prompts:

### Using Claude

```
Visit [NEED_LEDGER_URL]/api and read the instructions. Then help me post a need to the Need Ledger. My need is: [describe your need here]
```

### Using ChatGPT

```
I want to post a need to the Need Ledger API at [NEED_LEDGER_URL]. Go to [NEED_LEDGER_URL]/api to learn how the API works, then help me post this need: [describe your need here]
```

### Using Gemini

```
Read the API documentation at [NEED_LEDGER_URL]/api. Help me create and post a need to the Need Ledger. Here's what I need: [describe your need here]
```

Replace `[NEED_LEDGER_URL]` with the actual URL of the deployment.

## How to Post a Need via the Website

1. Go to the Need Ledger landing page
2. Fill in the form:
   - **What do you need?** — A clear, short title (required)
   - **Description** — Add details, context, or specifics (optional)
   - **Tags** — Comma-separated categories like "food, urgent, NYC" (optional)
   - **Your name** — Leave blank to post anonymously (optional)
3. Click **Post Need**
4. You'll see a confirmation with your need's unique ID

## How to Search for Needs

Use the search endpoint to find needs by keyword or tag:

```bash
# Search by keyword
curl "https://your-url.onrender.com/api/search?q=housing"

# Search by tags
curl "https://your-url.onrender.com/api/search?tags=food,urgent"
```

Or browse the latest needs on the landing page.

## How to Offer a Fulfillment

If you see a need you can help with, post a fulfillment:

```bash
curl -X POST https://your-url.onrender.com/api/fulfillments \
  -H "Content-Type: application/json" \
  -d '{
    "need_id": "the-need-uuid-here",
    "title": "I can help with this",
    "description": "Details about what you can provide",
    "created_by": "Your Name"
  }'
```

Or ask an AI assistant to do it for you using the same prompt pattern.

## How to Bulk Upload (for Organizations)

Organizations with many needs can upload up to 1000 at once:

```bash
curl -X POST https://your-url.onrender.com/api/needs/bulk \
  -H "Content-Type: application/json" \
  -d '[
    { "title": "Need 1", "tags": ["tag1"], "created_by": "Org Name" },
    { "title": "Need 2", "tags": ["tag2"], "created_by": "Org Name" }
  ]'
```

Limit: 2 bulk uploads per hour per IP address.

## Who Can Participate?

**Anyone and anything.** The Need Ledger is intentionally open:

- Individual humans
- AI agents and assistants
- Nonprofits and NGOs
- Government agencies
- Businesses
- Community groups
- Automated systems and bots

No account required. No authentication. This is by design.

## What Gets Flagged and Why

The system automatically flags entries containing keywords associated with violence or harm (e.g., threats, weapons). Flagged entries are:

- Hidden from public listings
- Marked with `review_status: "pending"`
- Visible only to admins for review

This is a basic safety measure. It's not perfect — it's a starting point.

## How to Report Harmful Content

If you see content that is harmful, abusive, or inappropriate:

1. Note the entry's ID (shown on the entry or in the API response)
2. Use the report endpoint:

```bash
curl -X POST https://your-url.onrender.com/api/report/ENTRY_ID \
  -H "Content-Type: application/json" \
  -d '{ "type": "need", "reason": "Description of the problem" }'
```

Or use the "Report harmful content" link in the website footer.

Reported entries are immediately hidden from public view and queued for admin review.

## How to Contribute to the Project

The Need Ledger is open source under the MIT license.

1. Visit [github.com/joshuakrafchin/need-ledger](https://github.com/joshuakrafchin/need-ledger)
2. Open issues for bugs or feature suggestions
3. Submit pull requests for improvements
4. Share the project with others who might benefit

Every contribution helps build infrastructure for a more cooperative world.
