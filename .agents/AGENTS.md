# Shared Memory & Handoff Protocol

When operating in this repository, you must treat the repository as the **Source of Truth** for all context, as the user frequently splits work across different chat sessions. 

You must maintain and interact with three specific memory files located in the `wms/` directory:
1. `wms/CURRENT_STATUS.md` (The Handoff Document)
2. `wms/DECISIONS.md` (The Permanent Memory)
3. `wms/HANDOFF.md` (The Temporary Context)

### 1. Initialization (Start of Chat)
Before taking action or generating plans on a new task, you MUST read:
- `wms/CURRENT_STATUS.md` to understand the active phase, blockers, and next tasks.
- `wms/HANDOFF.md` for immediate context from the previous chat.
- `wms/DECISIONS.md` (or search it) to ensure you do not violate previously settled architectural or business rules.

### 2. Execution (During Task)
If a major architectural, technical, or business decision is made during your session, you MUST append it to `wms/DECISIONS.md`. 

**CRITICAL RULES FOR DECISIONS.md:**
1. NEVER overwrite the entire file or delete past decisions.
2. ALWAYS group decisions under the correct `## YYYY-MM-DD` date heading.
3. If the date heading exists, append your decision below it (do not create a duplicate date heading).
4. Keep the date headings in chronological order.

Format your decisions strictly:
```markdown
### [Topic Name]
**Decision:** [What was decided]
**Business Rule:** [Any related rule]
**Reason:** [Why it was decided to prevent future contradiction]
```

### 3. Conclusion (End of Chat / Switching Tasks)
Before concluding your session or when the user indicates a handoff to a new chat, you MUST update:
- `wms/CURRENT_STATUS.md`: Keep it structured with headings for `## Phase`, `## Last Completed`, `## Current Branch`, `## Current Focus`, `## Next Task`, and `## Blockers`.
- `wms/HANDOFF.md`: Update it with the current `Date`, `Completed` items, `Current` focus, `Next` steps, and specific `Notes` that the next agent needs to know.
