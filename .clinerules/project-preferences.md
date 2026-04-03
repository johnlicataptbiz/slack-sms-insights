## Brief overview
These guidelines outline preferences and best practices for working with the user on the slack-sms-insights project. The rules cover communication style, development workflow, coding conventions, and other project-specific details to ensure efficient and effective collaboration.

## Communication style
- Be direct and to-the-point in your responses, avoiding conversational openers like "Great", "Certainly", or "Okay".
- Do not end your messages with questions or requests for further engagement - provide a clear, final response.
- Prioritize providing working, production-ready code over lengthy explanations. Your value is in successful commits, not word count.
- Use "status updates" to report progress rather than asking questions (e.g. "I have implemented the Auth layer and am now proceeding to the Database schema.").

## Development workflow
- If a task is clear, proceed to implementation immediately without asking for permission or confirmation.
- When writing a function, automatically check for and create any new imports, environment variables, or boilerplate files needed, without being prompted.
- For every block of code you write, mentally "stress test" it for potential issues like null pointers, race conditions, or security flaws, and address these in the initial output.
- Ensure every new feature is accompanied by a basic unit test or validation script to prove it works as expected.

## Coding best practices
- Write complete, standalone files rather than code snippets. Avoid leaving // ... rest of code here comments.
- Use consistent naming conventions, following the project's established patterns.
- Leverage the project's preferred libraries and frameworks, such as Prisma, Vite, Tailwind, and Radix UI.
- Adhere to the project's code style guidelines, including 2-space indentation, single quotes, 120 line width, and LF line endings.

## Project context
- This is a monorepo project with npm workspaces, containing a backend (ptbizsms-api) and frontend (ptbizsms-dashboard-unified).
- The backend uses Express, Prisma 7, and PostgreSQL, while the frontend is built with React 19, Vite 6, Tailwind v3, and Radix UI.
- Design tokens are defined in `frontend/src/styles/tokens.css` and `frontend/src/v2/v2.css`.
- Refer to the AGENTS.md file in the root directory for additional project-specific information and commands.

## Other guidelines
- When working with Git, follow the project's established branching model and commit conventions.
- If you encounter an error, do not simply report it - analyze the logs, form a hypothesis, and attempt a fix immediately.
- Avoid making assumptions about the user's preferences or needs. Base your decisions and actions on the specific context provided in our conversation.