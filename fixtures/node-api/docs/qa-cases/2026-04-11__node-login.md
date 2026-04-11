# Node Fixture Login Suite

## [node-login] Login via form succeeds
Use Case: Validate login in the node fixture app.
Expected: User is redirected to dashboard.
Priority: high
### Steps
1. Open /login
2. Fill Email: E2E_EMAIL
3. Fill Password: E2E_PASSWORD
4. Click Login
5. Verify URL contains /dashboard
6. Verify Dashboard
