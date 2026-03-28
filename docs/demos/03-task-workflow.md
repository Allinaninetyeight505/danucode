# Demo: Task-Driven Workflow

Danucode breaks large requests into tasks and works through them systematically.

```
❯ build a simple todo app with HTML, CSS, and JS — local storage persistence

  ● TaskCreate
    Task #1 created: HTML structure with input, button, and todo list
    ✓
  ● TaskCreate
    Task #2 created: CSS styling — clean, minimal design
    ✓
  ● TaskCreate
    Task #3 created: JavaScript — add, toggle, delete todos
    ✓
  ● TaskCreate
    Task #4 created: LocalStorage persistence — save/load on page load
    ✓
  ● TaskUpdate
    Task #1 → in_progress: HTML structure
    ✓
  ● Write  /home/user/todo/index.html
    Allow? [y/n/a(lways)] a
    Bash allowed for this session
    Wrote 35 lines to index.html
    ✓
  ● TaskUpdate
    Task #1 ✓ completed
    ✓
  ● TaskUpdate
    Task #2 → in_progress: CSS styling
    ✓
  ● Edit  /home/user/todo/index.html
    (adds <style> block...)
    ✓
  ● TaskUpdate
    Task #2 ✓ completed
    ✓
  ● TaskUpdate
    Task #3 → in_progress: JavaScript
    ✓
  ● Edit  /home/user/todo/index.html
    (adds <script> block with add/toggle/delete...)
    ✓
  ● TaskUpdate
    Task #3 ✓ completed
    ✓
  ● TaskUpdate
    Task #4 → in_progress: LocalStorage
    ✓
  ● Edit  /home/user/todo/index.html
    (wraps todo operations with localStorage save/load...)
    ✓
  ● TaskUpdate
    Task #4 ✓ completed
    ✓
  ● TaskList
    ✓ #1 [completed] HTML structure
    ✓ #2 [completed] CSS styling
    ✓ #3 [completed] JavaScript logic
    ✓ #4 [completed] LocalStorage persistence
    ✓

All 4 tasks complete. Open index.html in your browser to test.
The app saves todos to localStorage so they persist across page reloads.

⏵⏵ yolo · Qwen3.5-27B-Q4_K_M · ~4.8k
```
