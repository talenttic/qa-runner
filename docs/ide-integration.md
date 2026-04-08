# IDE Integration API

The QA Runner daemon exposes a local HTTP API so any IDE can submit events.

## Endpoint

- `POST /events`

## Payload

```json
{
  "files": ["/abs/path/file.ts"],
  "summary": "Short summary of change",
  "diff": "optional unified diff",
  "tool": "vscode|cursor|claude-code|other",
  "timestamp": 1710000000,
  "mode": "manual|e2e|all"
}
```

## Responses

- `200 OK`: includes counts and manifest
- `400 Bad Request`: invalid payload
