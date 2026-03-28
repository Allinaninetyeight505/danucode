# Demo: Plan Mode

Using plan mode to design before implementing — a REST API endpoint.

```
❯ /plan

  Entered plan mode
  Plan file: .danu/plan-keen-kauri-a3f2b1.md
  Read-only tools only. Write your plan, then call ExitPlanMode.

❯ I need a new API endpoint POST /api/users/invite that sends an email invitation

  ● Glob  **/*.js
    src/routes/users.js
    src/routes/auth.js
    src/services/email.js
    src/middleware/auth.js
    ✓
  ● Read  src/routes/users.js
    (existing user routes...)
    ✓
  ● Read  src/services/email.js
    (existing email service...)
    ✓
  ● Write  .danu/plan-keen-kauri-a3f2b1.md
    Wrote 45 lines to .danu/plan-keen-kauri-a3f2b1.md
    ✓
  ● ExitPlanMode

  Exited plan mode
  You can now proceed with implementation.

Plan:
1. Add POST /api/users/invite route in src/routes/users.js
2. Validate email format and check user doesn't already exist
3. Generate a signed invitation token (JWT, 7-day expiry)
4. Call email.sendInvite() from src/services/email.js
5. Store pending invitation in database
6. Return 201 with invitation ID

Ready to implement. The email service already has a `sendTemplate`
method we can reuse.

❯ go ahead

  ● TaskCreate
    Task #1 created: Add invite route to users.js
    ✓
  ● TaskCreate
    Task #2 created: Add invitation model/schema
    ✓
  ● TaskCreate
    Task #3 created: Add sendInvite to email service
    ✓
  ● TaskUpdate
    Task #1 → in_progress
    ✓
  ● Edit  src/routes/users.js
    (adds the route...)
    ✓
  ...
```
