<!--
  CANONICAL .http API-contract block format — single source of truth.
  Referenced by: /api-contract, /new-feature (Step 4), and B8.6 in /feature-from-confluence.
  Do not inline a divergent copy in those commands — point here instead.
-->

# `.http` Contract Format

One `###` block per endpoint. Header comment lines document provenance; the request line carries the verb + full path.

```http
@base_url = {{$dotenv API_BASE_URL}}
@token    = {{$dotenv ACCESS_TOKEN}}

### GET <resource> list
# Used by: <inferred from apiHooks.ts — e.g. "page load / SharedList">
# React Query key: ['<key>', params]
# FE calls: YES
GET {{base_url}}/api/v1/<full/path>?page=1&limit=20&search=
Authorization: Bearer {{token}}

###

### POST create <resource>
# Used by: <e.g. "Create button / modal submit">
# React Query key: invalidates ['<key>']
# FE calls: YES
POST {{base_url}}/api/v1/<full/path>
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "field": "value"
}

###

### EXPECTED RESPONSE SHAPES
// TypeScript-style types for every response above.
// interface <Resource> { id: number; ... }
// interface ListResponse { results: <Resource>[]; count: number; }
```

## Rules

- **Full paths (HR26).** `{{base_url}}` resolves to the **server root only** (no path segments). Every request line MUST contain the literal `/api/v1/...` path — never bury the prefix inside a variable.
- **Wire shape (HR33 / v3.16).** When `data/transform.ts` exists, derive `### EXPECTED RESPONSE SHAPES` from each `mapXxx(raw)` mapper's **`raw` (wire) input** — the on-the-wire field names the server actually returns (often snake_case), not just the camelCase domain types.
- **Annotations.** Each block documents `# Used by`, `# React Query key` (or `invalidates`), and `# FE calls: YES|NO`.
- **Filename.** `.full.http` for a complete generated contract (B8.6 / api-contract); `.http` for a scaffold (new-feature).
