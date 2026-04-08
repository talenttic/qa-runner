export const uiVersion = "0.1.0";
export function getUiHtml() {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>QA Runner UI</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; margin: 2rem; }
      h1 { margin: 0 0 0.5rem 0; }
      code { background: #f4f4f5; padding: 0.1rem 0.3rem; border-radius: 4px; }
      .card { border: 1px solid #e4e4e7; border-radius: 8px; padding: 1rem; margin-top: 1rem; }
    </style>
  </head>
  <body>
    <h1>QA Runner UI</h1>
    <p>Local UI server is running. This minimal shell will be replaced by the full dashboard bundle.</p>
    <div class="card">
      <p>Endpoints:</p>
      <ul>
        <li><code>GET /status</code></li>
        <li><code>GET /manifest</code></li>
        <li><code>POST /events</code></li>
      </ul>
    </div>
  </body>
</html>`;
}
//# sourceMappingURL=index.js.map