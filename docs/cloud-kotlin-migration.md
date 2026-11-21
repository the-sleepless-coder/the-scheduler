# Kotlin Spring Boot backend migration

## Task

Implement the complete replacement backend in `backend/`, using the existing
NestJS implementation in `V1-backend/` as the behavior reference. This is an
implementation task: finish the code, run the available checks, and return a
reviewable diff rather than only proposing a plan.

The user explicitly requested cloud execution, keeping `V1-backend/` intact and
putting the new Kotlin implementation in `backend/`.

Repository: `the-sleepless-coder/the-scheduler`.
Cloud input branch: `codex/kotlin-backend-migration-20261121`.
The source archive is commit `7f2460cfa0ec71748d8c3610c918de04f15affa5`.

## Scope and stack

- Preserve every file in `V1-backend/` unchanged.
- Create the complete Kotlin application in `backend/`.
- Use Kotlin/JVM **2.4.21**, Spring Boot **4.2.0**, Java **21**, and Gradle
  Kotlin DSL with a checked-in Gradle wrapper compatible with these versions.
  Both requested version coordinates were checked in Maven Central before
  dispatch. If dependency resolution still fails, investigate and report the
  actual failure; do not silently choose different framework versions.
- Use Spring MVC, Spring Data JPA, MySQL, Spring Security, JWT, and BCrypt.
- Keep the React frontend and its API calls compatible. Do not redesign the UI
  or change its business behavior to accommodate an incomplete backend.
- Update the backend Dockerfile, root Compose integration, `.gitignore`, and
  README/run instructions as needed. Keep the API on port `5004` under `/api`
  and the frontend on `5003`.
- Keep the existing MySQL service, database name, and `mysql-data` volume.
  Do not delete a volume, drop a database, or reset existing user data.
- Do not deploy a production service, change unrelated account settings, or
  introduce new paid infrastructure. Cloud coding and production hosting are
  separate tasks.

## Establish the contract before implementing

Read all controllers, DTOs, services, and entities under `V1-backend/src/`, plus
`frontend/src/api.ts` and the frontend call sites. There are **39 HTTP routes**,
**9 controllers**, and **10 database entities**. Record a compact route/contract
inventory in the repository and use it to check implementation completeness.

Keep methods, paths, query parameters, request JSON names, response JSON names,
nullable fields, array responses, success statuses, validation behavior, and
error messages compatible with the legacy code. In particular:

- Preserve the response property names `isChore` and `isFolder`; do not let
  Kotlin/Jackson boolean naming rules turn them into `chore` or `folder`.
- Distinguish an omitted PATCH property from an explicit `null`. An update of
  one field must not clear all other fields.
- Return JSON for successful deletes and other operations expected to return
  `{ "ok": true }`; the existing frontend always parses successful responses
  as JSON.
- Respect existing ordering and date/time formats, including date-only fields,
  `HH:mm` fields, month strings, and serialized timestamps.
- Preserve nesting/parent IDs and all relevant defaults and optional fields.

## Database and authentication compatibility

- Explicitly map the legacy table and column names, including camelCase columns
  such as `userId`, `createdAt`, and `deletedAt`. Do not let the Hibernate naming
  strategy silently create snake_case replacement columns.
- Match existing identifier types, nullable fields, boolean storage, date types,
  string lengths, and relationships. Check the TypeORM entity definitions.
- Preserve soft deletion and filtering of deleted records. Deleted occurrences
  of recurring tasks must remain excluded from regeneration.
- Keep all reads and writes scoped to the authenticated user. Include negative
  tests proving that one user cannot read or modify another user's records.
- Existing BCrypt hashes must continue to authenticate. JWTs must use the
  configured `JWT_SECRET`, legacy claim meanings (`sub` and `email`), and the
  existing expiration policy. Do not log passwords or tokens or expose password
  hashes in user responses.
- Continue to accept the environment variables already passed by Compose:
  `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `PORT`.
  Document local development overrides, including host MySQL port `3307`.
- Provide a documented, data-preserving way to start against an existing
  TypeORM-created database. Do not use `create-drop` with existing user data.

## Behavior that must be ported, not approximated

- Registration, login, current-user lookup, and password change.
- Daily tasks, range queries, categories, ordering, priority, top-three fields,
  task memo/sub-item references, and time-box copies.
- Daily recurring tasks, weekly items with allowed weekdays, and bounded-period
  items, including creation-date boundaries, inclusive ranges, duplicate
  prevention, and preservation of soft-deleted instances.
- Monthly memos, memo item hierarchies and content, and memo-item logs with
  labels/units.
- Synchronization of task completion with memo items and parent completion.
- Folder rename across the related task/memo/topic records, folder hiding,
  and copying selected or filtered memo hierarchies into the following month.
- Mind topics and the month/week keys already used by the frontend.

Use appropriate transaction boundaries for related database mutations. Do not
replace these rules with generic CRUD endpoints or TODO implementations.

## Tests and validation

Follow these test conventions supplied by the user for this task:

- Write tests in Kotlin with Kotest `BehaviorSpec` and `given` / `when` / `then`,
  using `// arrange`, `// act`, and `// assert` sections where appropriate.
- Keep tests focused on distinct regressions, with fixed dates and concrete
  expected results. Avoid duplicating a business rule at every test layer.
- Use appropriate shared `UnitTest`, `IntegrationTest`, and `E2ETest` bases for
  this new project rather than importing nonexistent waiker application classes.
- Controller-to-repository coverage uses MockMvc and a real isolated test MySQL
  database, preferably Testcontainers MySQL 8. Do not mock repositories or use
  production credentials/data. Use test-only users and JWT secrets.
- Clean the test database between cases. Use fixture builders where fixtures
  are shared by multiple test classes. Mock only external HTTP dependencies if
  any are introduced; the legacy app has no required third-party HTTP service.
- Cover authentication/errors, user isolation, omitted-versus-null PATCH,
  recurrence boundaries/idempotency/deleted-instance handling, memo completion
  propagation, folder rename/hiding, and next-month parent/child copying.
- Test legacy schema and API compatibility, not just fresh Hibernate-generated
  tables. Include concrete full response JSON assertions in E2E coverage, with
  deliberate handling of generated IDs and timestamps.
- Compile the test sources, run the meaningful tests and `bootJar`, and build
  or validate the Docker/Compose configuration where the environment permits.
  Validate the unchanged frontend still builds if dependencies are available.
- If Docker/MySQL or a network dependency is unavailable in the cloud, report
  the exact blocked command and what did and did not run. Do not silently skip
  integration tests or substitute H2 and claim MySQL compatibility was verified.
- Reuse any existing API contract/collection artifacts. Keep any new API
  contract and verification artifacts in Git. No Postman workspace publication
  or unrelated service setup is needed for this migration.

## Progress and deliverables

Report progress at meaningful milestones: contract analysis, application/auth/DB
setup, route and business-rule implementation, tests/build, and final review.
Include the changed files and actual command results in the final report.
State outstanding limitations plainly. Verify `V1-backend/` is unchanged.

Leave the complete implementation as a reviewable cloud-task diff. Do not
force-push, merge into `master`, or assume access to the user's local machine.
The caller will fetch/apply the result locally after cloud execution finishes.
