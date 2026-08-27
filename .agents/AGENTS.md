# Shared Memory & Handoff Protocol

When operating in this repository, you must treat the repository as the **Source of Truth** for all context, as the user frequently splits work across different chat sessions. 

You must maintain and interact with three specific memory files located in the directory:
1. `CURRENT_STATUS.md` (The Handoff Document)
2. `DECISIONS.md` (The Permanent Memory)
3. `HANDOFF.md` (The Temporary Context)

### 1. Initialization (Start of Chat)
Before taking action or generating plans on a new task, you MUST read:
- `CURRENT_STATUS.md` to understand the active phase, blockers, and next tasks.
- `HANDOFF.md` for immediate context from the previous chat.
- `DECISIONS.md` (or search it) to ensure you do not violate previously settled architectural or business rules.

### 2. Execution (During Task)
If a major architectural, technical, or business decision is made during your session, you MUST append it to `DECISIONS.md`. 

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

### 3. Skill Utilization & Frontend Craft Standards
- On every run, actively review and utilize relevant available skills in `.agents/skills/`.
- Strictly adhere to `studio-atelier-frontend-style-guide.md` for all frontend design tokens, typography, component craft, and UX patterns.

