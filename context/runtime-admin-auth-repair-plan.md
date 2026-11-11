# Runtime, administration and sign-in repair

Authorized: 2026-11-11. The user confirmed the active project is RentralMobile,
served at http://localhost:3000/admin. The separate rentral workspace/Supabase
preview on port3100 is not the application they were inspecting.

## Scope

- Use npm/Node24 and the existing MongoDB/JWT/local private storage architecture.
- Reorganize the real /admin page into focused, responsive review workspaces.
- Make gallery permission state explicit; explain independent review and the
  owner's deliberate self-override, validate reasons and recover stale decisions.
- Notify an approved uploader once and invalidate affected views after the saved
  command without turning a cache error into an unconfirmed database result.
- Keep email/password and add Google as an alternative for web sign-in. Reuse
  existing Mongo accounts/sessions; never automatically link by matching email.
- Require an Individual/Organization choice for new web accounts. Organizations
  supply registration evidence and need independent admin approval before using
  marketplace routes/actions/APIs. Personal KYC remains removed.
- Preserve existing accounts, uploads, audit and payment history. Do not modify
  hosted database structure, provider settings or private environment values.
  Additional Google/organization setup is source-only until separately applied.

## Verification and handoff

Inspect the current environment without printing values, distinguish configured
credentials from provider acceptance, and save setup instructions for this project.
Test domain policies, authorization, original-command recovery and responsive UI.
Run lint, TypeScript, unit regressions and production compilation after merging.
Owned Mongo fixtures may run only on disposable local databases, never Atlas.
Restart the confirmed app with one backend on port3000 after source verification;
leave other projects, Metro, storage and the old Supabase database untouched.