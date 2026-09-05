CREATE TABLE `field_claims` (
	`id` integer PRIMARY KEY NOT NULL,
	`season` integer NOT NULL,
	`owner` text NOT NULL,
	`lease_until` integer NOT NULL,
	`coverage` real DEFAULT 0 NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_claims_season` ON `field_claims` (`season`);--> statement-breakpoint
CREATE INDEX `idx_claims_owner` ON `field_claims` (`owner`);--> statement-breakpoint
CREATE TABLE `payouts` (
	`job` integer PRIMARY KEY NOT NULL,
	`season` integer NOT NULL,
	`pilot` text NOT NULL,
	`earnings` integer NOT NULL,
	`acres` real NOT NULL,
	`coverage` real NOT NULL,
	`elapsed` real NOT NULL,
	`completed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_payouts_season_pilot` ON `payouts` (`season`,`pilot`);--> statement-breakpoint
CREATE TABLE `pilots` (
	`id` text PRIMARY KEY NOT NULL,
	`callsign` text NOT NULL,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`request_id` text,
	`season` integer NOT NULL,
	`active_job` integer,
	`seen_at` integer NOT NULL,
	`credit` real DEFAULT 0.15 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_pilots_seen_at` ON `pilots` (`seen_at`);