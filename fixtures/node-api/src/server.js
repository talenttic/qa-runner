import express from "express";

const app = express();
const port = Number(process.env.PORT || 3101);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/login", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Fixture Login</title></head>
  <body>
    <h1>Node Fixture Login</h1>
    <form method="post" action="/login">
      <label>Email <input data-testid="email" name="Email" /></label>
      <label>Password <input data-testid="password" name="Password" type="password" /></label>
      <button data-testid="login" type="submit">Login</button>
    </form>
  </body>
</html>`);
});

app.post("/login", (req, res) => {
  const password = String(req.body.Password || "");
  if (password === "correct-password") {
    res.redirect(302, "/dashboard");
    return;
  }
  res.status(401).type("html").send(`<!doctype html><html><body><p>Invalid credentials</p><a href="/login">Back</a></body></html>`);
});

app.get("/dashboard", (_req, res) => {
  res.type("html").send(`<!doctype html><html><body><h1>Dashboard</h1><p>Welcome</p></body></html>`);
});

app.listen(port, () => {
  console.log(`node fixture listening on http://127.0.0.1:${port}`);
});
