# Demo: Basic Usage

A typical Danucode session — reading code, finding a bug, fixing it.

```
$ danu

  ____                                 _
 |  _ \  __ _ _ __  _   _  ___ ___   __| | ___
 | | | |/ _` | '_ \| | | |/ __/ _ \ / _` |/ _ \
 | |_| | (_| | | | | |_| | (_| (_) | (_| |  __/
 |____/ \__,_|_| |_|\__,_|\___\___/ \__,_|\___|

  v0.1.0 · Qwen3.5-27B-Q4_K_M · 192.168.77.205:8080  (c) Danucore
  /home/user/myapp
  /help for commands · Esc to cancel/quit

❯ what does the login function do?

  ● Read  /home/user/myapp/src/auth.js
    1  import bcrypt from 'bcrypt';
    2  import jwt from 'jsonwebtoken';
    3  ...
    ✓

The `login` function in `src/auth.js:15` takes an email and password,
looks up the user in the database, compares the password hash with
`bcrypt.compare`, and returns a signed JWT token if valid.

❯ there's a bug — it doesn't handle the case where the user doesn't exist

  ● Read  /home/user/myapp/src/auth.js
    ✓
  ● Edit  /home/user/myapp/src/auth.js
    Allow? [y/n/a(lways)] y
    ────────────────────────────────────────────────────
    Diff:
      const user = await db.users.findOne({ email });
    [-]   const valid = await bcrypt.compare(password, user.passwordHash);
    [+]   if (!user) return { error: 'Invalid credentials' };
    [+]   const valid = await bcrypt.compare(password, user.passwordHash);
    ────────────────────────────────────────────────────
    Edited src/auth.js: replaced 1 occurrence.
    ✓

Fixed. Added a null check for `user` before accessing `passwordHash`.
The function now returns `{ error: 'Invalid credentials' }` when the
user is not found, same as an invalid password — preventing user
enumeration.

⏵ perms on · Qwen3.5-27B-Q4_K_M · ~1.2k
```
