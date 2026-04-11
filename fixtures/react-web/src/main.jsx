import React, { useState } from "react";
import { createRoot } from "react-dom/client";

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = (event) => {
    event.preventDefault();
    if (password === "correct-password") {
      setLoggedIn(true);
      setError("");
      return;
    }
    setError("Invalid credentials");
  };

  if (loggedIn) {
    return (
      <main>
        <h1>Dashboard</h1>
        <p>Welcome {email || "tester"}</p>
      </main>
    );
  }

  return (
    <main>
      <h1>React Fixture Login</h1>
      <form onSubmit={onSubmit}>
        <label>
          Email
          <input
            data-testid="email"
            aria-label="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            data-testid="password"
            aria-label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button data-testid="login" type="submit">Login</button>
      </form>
      {error ? <p>{error}</p> : null}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
