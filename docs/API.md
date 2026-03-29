# Need Ledger API Documentation

Base URL: `https://your-project.vercel.app`

No authentication required for public endpoints. This is intentional — the Need Ledger is open by design.

## Response Format

All responses follow this shape:

```json
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": "Description of what went wrong" }
```

## Rate Limits

| Endpoint Type | Limit |
|---------------|-------|
| GET (reads) | 200 requests/IP/hour |
| POST (writes) | 20 requests/IP/hour |
| POST bulk | 2 requests/IP/hour |

After 50 requests in an hour, responses are slowed by 500ms per request.

---

## Endpoints

### GET /api

Returns API info, available endpoints, and field descriptions.

```bash
curl https://your-project.vercel.app/api
```

---

### GET /api/status

Returns project status and entry counts.

```bash
curl https://your-project.vercel.app/api/status
```

Response:
```json
{
  "success": true,
  "data": {
    "status": "MVP — active development",
    "needs_count": 42,
    "fulfillments_count": 7,
    "last_need_at": "2025-01-15T10:30:00.000Z",
    "version": "1.0.0"
  }
}
```

---

### POST /api/needs

Create a new need.

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | Yes | Max 500 chars |
| description | string | No | Max 10,000 chars |
| tags | string[] | No | Array of tag strings |
| metadata | object | No | Free-form JSONB, max 50KB |
| created_by | string | No | Name or identifier |
| anonymity_level | string | No | Default: "public" |
| source | string | No | Where this came from |
| fulfillments_wanted | string | No | Default: "unlimited" |

```bash
curl -X POST https://your-project.vercel.app/api/needs \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Need 100 meals for community event",
    "description": "Organizing a neighborhood gathering, need donated meals.",
    "tags": ["food", "community", "donations"],
    "created_by": "Jane Doe",
    "source": "community-board"
  }'
```

Response (201):
```json
{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "title": "Need 100 meals for community event",
    "description": "Organizing a neighborhood gathering, need donated meals.",
    "tags": ["food", "community", "donations"],
    "metadata": {},
    "created_by": "Jane Doe",
    "anonymity_level": "public",
    "source": "community-board",
    "fulfillments_wanted": "unlimited",
    "flagged": false,
    "review_status": "ok",
    "created_at": "2025-01-15T10:30:00.000Z",
    "updated_at": "2025-01-15T10:30:00.000Z"
  }
}
```

---

### GET /api/needs

List needs. Flagged entries are excluded by default.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| tags | string | Comma-separated tag filter |
| created_by | string | Filter by creator |
| source | string | Filter by source |
| limit | number | Max results (default 20, max 100) |
| offset | number | Pagination offset (default 0) |

```bash
# Get latest 20 needs
curl https://your-project.vercel.app/api/needs

# Filter by tags
curl "https://your-project.vercel.app/api/needs?tags=food,housing&limit=10"

# Filter by creator
curl "https://your-project.vercel.app/api/needs?created_by=Jane%20Doe"
```

---

### GET /api/needs/:id

Get a single need with all its fulfillments.

```bash
curl https://your-project.vercel.app/api/needs/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "title": "Need 100 meals for community event",
    "fulfillments": [
      {
        "id": "f1f2f3f4-...",
        "need_id": "a1b2c3d4-...",
        "title": "Can provide 50 sandwiches",
        "created_at": "2025-01-15T12:00:00.000Z"
      }
    ]
  }
}
```

---

### POST /api/needs/bulk

Bulk upload up to 1000 needs in one request.

```bash
curl -X POST https://your-project.vercel.app/api/needs/bulk \
  -H "Content-Type: application/json" \
  -d '[
    { "title": "Need winter coats", "tags": ["clothing", "winter"] },
    { "title": "Need tutoring for math", "tags": ["education"] },
    { "title": "Need temporary housing", "tags": ["housing", "urgent"] }
  ]'
```

Response (201):
```json
{
  "success": true,
  "data": {
    "created": 3,
    "ids": ["uuid-1", "uuid-2", "uuid-3"],
    "flagged_count": 0
  }
}
```

---

### POST /api/fulfillments

Post a fulfillment for an existing need. Requires `need_id`.

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| need_id | UUID | Yes | The need being fulfilled |
| references_id | UUID | No | Chain to a prior fulfillment (for updates/proof) |
| title | string | Yes | Max 500 chars |
| description | string | No | Max 10,000 chars |
| status | string | No | One of: offering, in_progress, completed, withdrawn. Default: "offering" |
| tags | string[] | No | Array of tag strings |
| metadata | object | No | Free-form JSONB — use for proof (proof_url, receipt, photo) |
| created_by | string | No | Name or identifier |
| anonymity_level | string | No | Default: "public" |
| source | string | No | Where this came from |

**How fulfillment status works:**

Every action is a new post. Nothing gets overwritten. The chain of fulfillments IS the history.

1. Post with `status: "offering"` — "I can help with this"
2. Post with `status: "in_progress"` and `references_id` pointing to your offering — "I'm working on it"
3. Post with `status: "completed"` and `references_id` pointing to your prior post — "Done. Here's proof."
4. Include proof in `metadata`: `{ "proof_url": "...", "receipt": "...", "photo": "..." }`

```bash
# Initial offer
curl -X POST https://your-project.vercel.app/api/fulfillments \
  -H "Content-Type: application/json" \
  -d '{
    "need_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "title": "I can provide 50 sandwiches",
    "description": "Will deliver to the event location.",
    "status": "offering",
    "created_by": "Local Deli"
  }'

# Mark completed with proof
curl -X POST https://your-project.vercel.app/api/fulfillments \
  -H "Content-Type: application/json" \
  -d '{
    "need_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "references_id": "the-offering-fulfillment-id",
    "title": "Delivered 50 sandwiches",
    "status": "completed",
    "created_by": "Local Deli",
    "metadata": { "proof_url": "https://example.com/delivery-photo.jpg" }
  }'
```

---

### GET /api/fulfillments

List fulfillments. Optionally filter by need_id.

```bash
# All fulfillments
curl https://your-project.vercel.app/api/fulfillments

# For a specific need
curl "https://your-project.vercel.app/api/fulfillments?need_id=a1b2c3d4-..."
```

---

### GET /api/search

Search across needs and fulfillments by text or tags.

| Param | Type | Description |
|-------|------|-------------|
| q | string | Text search (searches title and description) |
| tags | string | Comma-separated tag filter |
| limit | number | Max results per type (default 20) |

```bash
# Text search
curl "https://your-project.vercel.app/api/search?q=housing"

# Tag search
curl "https://your-project.vercel.app/api/search?tags=food,urgent"

# Combined
curl "https://your-project.vercel.app/api/search?q=meals&tags=community"
```

Response:
```json
{
  "success": true,
  "data": {
    "needs": [ ... ],
    "fulfillments": [ ... ]
  }
}
```

---

### POST /api/report/:id

Report a harmful entry for review.

```bash
curl -X POST https://your-project.vercel.app/api/report/a1b2c3d4-... \
  -H "Content-Type: application/json" \
  -d '{
    "type": "need",
    "reason": "Spam content"
  }'
```

---

## Admin Endpoints

All admin endpoints require the `X-Admin-Secret` header.

### GET /api/admin/flagged

List all flagged needs and fulfillments.

```bash
curl https://your-project.vercel.app/api/admin/flagged \
  -H "X-Admin-Secret: your-secret"
```

### POST /api/admin/unflag/:id

Clear a flag on an entry.

```bash
curl -X POST https://your-project.vercel.app/api/admin/unflag/a1b2c3d4-... \
  -H "X-Admin-Secret: your-secret" \
  -H "Content-Type: application/json" \
  -d '{ "type": "need" }'
```

### DELETE /api/admin/entry/:id

Hard delete an entry.

```bash
curl -X DELETE https://your-project.vercel.app/api/admin/entry/a1b2c3d4-... \
  -H "X-Admin-Secret: your-secret" \
  -H "Content-Type: application/json" \
  -d '{ "type": "need" }'
```

---

## Need Schema

```json
{
  "id": "UUID (auto-generated)",
  "title": "string (required, max 500 chars)",
  "description": "string (max 10,000 chars)",
  "tags": ["string array"],
  "metadata": { "free-form JSONB, max 50KB" },
  "created_by": "string",
  "anonymity_level": "string (default: public)",
  "source": "string",
  "fulfillments_wanted": "string (default: unlimited)",
  "flagged": "boolean",
  "review_status": "string (ok | pending | reported)",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

## Fulfillment Schema

```json
{
  "id": "UUID (auto-generated)",
  "need_id": "UUID (required, references needs.id)",
  "references_id": "UUID (optional, references fulfillments.id — for chaining updates/proof)",
  "title": "string (required, max 500 chars)",
  "description": "string (max 10,000 chars)",
  "status": "string (offering | in_progress | completed | withdrawn, default: offering)",
  "tags": ["string array"],
  "metadata": { "free-form JSONB — use for proof: proof_url, receipt, photo, etc." },
  "created_by": "string",
  "anonymity_level": "string (default: public)",
  "source": "string",
  "flagged": "boolean",
  "review_status": "string (ok | pending | reported)",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

## Error Examples

```json
// Missing required field
{ "success": false, "error": "title is required" }

// Not found
{ "success": false, "error": "Need not found" }

// Rate limited
{ "success": false, "error": "Too many requests. Try again later." }

// Unauthorized (admin)
{ "success": false, "error": "Unauthorized" }
```
