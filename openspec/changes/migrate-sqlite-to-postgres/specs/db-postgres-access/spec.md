## ADDED Requirements

### Requirement: Connection pooling
The system SHALL access PostgreSQL through a shared connection pool rather than a single long-lived connection, configured from a `DATABASE_URL` environment variable.

#### Scenario: Pool reused across requests
- **WHEN** multiple concurrent HTTP requests each need database access
- **THEN** the system SHALL acquire connections from a shared pool rather than opening a new connection per request, and SHALL release each connection back to the pool when the query completes

#### Scenario: Missing connection string
- **WHEN** the process starts without a `DATABASE_URL` environment variable set
- **THEN** the system SHALL fail fast at startup with a clear error rather than attempting to connect with an undefined configuration

### Requirement: Async data access API
All functions in the data access layer (models and route handlers that query the database) SHALL be asynchronous and return Promises, replacing the previous synchronous `better-sqlite3` calls.

#### Scenario: Model function awaited
- **WHEN** a route handler calls a model function such as `findUserById`
- **THEN** the function SHALL return a Promise that resolves with the row data or rejects with a database error, and the caller SHALL `await` it

### Requirement: Parameterized queries
All queries SHALL use PostgreSQL's positional parameter placeholders (`$1`, `$2`, ...) instead of SQLite's `?` placeholders, and SHALL NOT interpolate user-supplied values directly into SQL strings.

#### Scenario: User-supplied search value
- **WHEN** a caller passes a search term (e.g. an email or ticket subject substring) into a listing query
- **THEN** the value SHALL be passed as a bound parameter, never concatenated into the query text

### Requirement: Explicit transaction handling
Multi-statement operations that were previously wrapped in `better-sqlite3`'s synchronous `db.transaction(fn)` SHALL be rewritten as explicit `BEGIN`/`COMMIT`/`ROLLBACK` transactions using a single checked-out client from the pool.

#### Scenario: Transaction succeeds
- **WHEN** a multi-step operation such as tree creation (creating a tree row, a permission row, and a family_data row) completes all of its statements without error
- **THEN** the system SHALL commit the transaction so all changes are persisted together

#### Scenario: Transaction fails partway through
- **WHEN** any statement within a multi-step operation raises an error
- **THEN** the system SHALL roll back the transaction so none of its statements are persisted, and SHALL release the client back to the pool

### Requirement: PostgreSQL-native types and functions
The schema and queries SHALL use PostgreSQL-native types and functions in place of the SQLite equivalents: `TIMESTAMPTZ` instead of `TEXT` timestamp columns, `BOOLEAN` instead of `INTEGER` flag columns, `BYTEA` instead of `BLOB`, `JSONB` instead of `TEXT` for the `family_data.json_data` column, `NOW()`/`INTERVAL` instead of `datetime('now', ...)`, and `jsonb_array_length()` instead of `json_array_length()`.

#### Scenario: Reading a timestamp column
- **WHEN** a row containing a `created_at` or `updated_at` column is read back
- **THEN** the value SHALL be a native timestamp-with-timezone value rather than a text string requiring parsing

#### Scenario: Counting members in a tree's JSON payload
- **WHEN** the system computes a tree's member count from `family_data.json_data`
- **THEN** it SHALL use `jsonb_array_length(json_data)` against a `JSONB`-typed column and produce the same count as the prior SQLite `json_array_length` behavior
