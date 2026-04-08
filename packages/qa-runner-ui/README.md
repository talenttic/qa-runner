# QA Runner UI

A React-based web interface for QA Runner, providing manual and AI-assisted testing capabilities.

## Development

```bash
npm run dev
```

This starts the Vite development server on `http://localhost:5174`.

## Features

- Manual QA testing with suite and case management
- AI-assisted testing with automated execution
- Test generation from prompts
- Validation and reporting
- Dark/light theme support
- Real-time status updates

## Usage

1. Start the QA Runner daemon in your target project:
   ```bash
   npm run qa:daemon
   ```

2. Open the UI at `http://localhost:4545/ui` or run the standalone UI:
   ```bash
   npm run dev
   ```

### Standalone Demo Mode

When the daemon is not running, the UI loads a sample suite to avoid JSON parse errors.
To connect the standalone UI to a daemon, set:

```bash
export VITE_API_URL=http://localhost:4545
npm run dev
```

### Custom Test Types (Plugin Config)

Define custom AI test types in:

```
tools/qa-runner.plugins.json
```

Restart the daemon after editing the file so the UI can load the new types.

### GitHub Issues Integration

To create GitHub issues from the UI, set a GitHub PAT before starting the daemon:

```bash
export QA_RUNNER_GITHUB_TOKEN=ghp_...
npm run qa:daemon
```

You can then create issues from the **GitHub Issue** section inside a manual run.

## Building

```bash
npm run build
```

## Contributing

- Follow TypeScript best practices
- Use Tailwind CSS for styling
- Ensure accessibility compliance
- Test on both light and dark themes
