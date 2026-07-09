## ADDED Requirements

### Requirement: Numbered forward-only migrations
Schema changes SHALL be defined as numbered, forward-only SQL migration files applied in ascending order, replacing the previous ad hoc `runMigrations()` function that inspected table structure at boot and patched it conditionally.

#### Scenario: New migration file added
- **WHEN** a developer adds a new migration file with the next sequence number
- **THEN** the system SHALL apply it after all previously-applied migrations, in order, the next time migrations are run

#### Scenario: Migration already applied
- **WHEN** the system runs its migration step and a given migration file has already been recorded as applied
- **THEN** the system SHALL skip re-applying that migration

### Requirement: Migration state tracking
The system SHALL record which migrations have been applied in a dedicated tracking table in the database, rather than inferring applied state by inspecting existing column/table presence.

#### Scenario: Fresh database
- **WHEN** migrations are run against a database with no tracking table yet
- **THEN** the system SHALL create the tracking table and then apply all migrations from the beginning in order

#### Scenario: Partially migrated database
- **WHEN** migrations are run against a database where some migrations are already recorded as applied
- **THEN** the system SHALL apply only the migrations not yet recorded, in order

### Requirement: One-time SQLite-to-Postgres data migration
The system SHALL provide a one-time migration script that reads all existing rows from the legacy SQLite database file and inserts them into PostgreSQL, preserving primary key values and binary attachment data.

#### Scenario: Migrating existing rows
- **WHEN** the migration script is run against a populated SQLite database file and an empty PostgreSQL database
- **THEN** every row from every SQLite table SHALL exist in the corresponding PostgreSQL table afterward, with the same primary key values and equivalent column values (including BLOB attachment bytes copied into `BYTEA` columns)

#### Scenario: Re-running the migration script
- **WHEN** the one-time migration script is run a second time against a PostgreSQL database that already contains the migrated data
- **THEN** the system SHALL detect existing data and refuse to duplicate rows, rather than silently inserting duplicates
