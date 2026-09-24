# Run 1 password and persona contract

POST /v1/auth/register accepts only email, password, displayName and returns 201 with `{data:{registered:true}}`. Email is normalized; registration never provisions staff membership. POST /v1/auth/login accepts only email and password and returns the existing SessionTokenBundle in `data` (200). OIDC session exchange is unchanged.

Validation: 400; duplicate registration: 409 with a generic message; invalid credentials (including unknown email or inactive user): 401; bounded authentication capacity: 503. Both routes enforce JSON, 16 KiB bodies (413), POST (405), and no-store responses. Unexpected failures return a sanitized 500.

GET /v1/me authenticates the active user and session, then resolves memberships transactionally. It returns user, sessionId, persona, memberships, workspace, requiresWorkspaceSelection. Zero active staff memberships yields PATIENT without a workspace. One active membership resolves DOCTOR, NURSE, RECEPTIONIST or CLINIC_ADMIN. Multiple memberships return null persona/workspace until X-Workspace-ID selects an authorized membership. Unknown/corrupt authority or inactive workspace returns 403; session failure returns 401; lookup failures return 500, never PATIENT.

Android maps canonical CLINIC_ADMIN to its existing ADMIN enum. Staging/prod use HttpPasswordGateway over ApiClient; configure `-PvioraBackendBaseUrl=https://<your-backend-origin>` or VIORA_BACKEND_BASE_URL. The origin must have no path/query/credentials. Missing configuration disables network; devDebug stays synthetic. For a local backend use a trusted HTTPS development endpoint/tunnel; cleartext and TLS verification are unchanged. Registration returns to login. Patient healthcare features remain unavailable; Patient, Nurse and Receptionist AI routes are denied.

Focused PostgreSQL test: set DATABASE_URL to a disposable viora_mobile_test database and VIORA_DISPOSABLE_DATABASE=1, then run `node --experimental-strip-types --test apps/api/src/postgres-password.integration.test.ts`. This test resets public and uses synthetic data only.
