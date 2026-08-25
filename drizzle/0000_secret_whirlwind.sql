CREATE TABLE `comparisons` (
	`id` text PRIMARY KEY NOT NULL,
	`left_version_id` text NOT NULL,
	`right_version_id` text NOT NULL,
	`inputs` text,
	`left_run_id` text,
	`right_run_id` text,
	`winner` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`left_version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`right_version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`left_run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`right_run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`archetype` text DEFAULT 'custom' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`lineage_id` text NOT NULL,
	`forked_from_version_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `prompts_lineage_idx` ON `prompts` (`lineage_id`);--> statement-breakpoint
CREATE TABLE `results` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`test_case_id` text NOT NULL,
	`version_id` text NOT NULL,
	`passed` integer NOT NULL,
	`detail` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`test_case_id`) REFERENCES `test_cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `results_version_idx` ON `results` (`version_id`);--> statement-breakpoint
CREATE INDEX `results_test_case_idx` ON `results` (`test_case_id`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`test_case_id` text,
	`model` text NOT NULL,
	`effort` text,
	`rendered` text NOT NULL,
	`response` text,
	`usage` text,
	`duration_ms` integer,
	`cost_usd` real,
	`error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`test_case_id`) REFERENCES `test_cases`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `runs_version_idx` ON `runs` (`version_id`);--> statement-breakpoint
CREATE INDEX `runs_test_case_idx` ON `runs` (`test_case_id`);--> statement-breakpoint
CREATE TABLE `stack_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`stack` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stack_presets_name_unique` ON `stack_presets` (`name`);--> statement-breakpoint
CREATE TABLE `test_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt_id` text NOT NULL,
	`name` text NOT NULL,
	`inputs` text NOT NULL,
	`expected` text,
	`assertion` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `test_cases_prompt_idx` ON `test_cases` (`prompt_id`);--> statement-breakpoint
CREATE TABLE `versions` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt_id` text NOT NULL,
	`number` integer NOT NULL,
	`message` text,
	`sections` text NOT NULL,
	`stack` text,
	`channel_overrides` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `versions_prompt_idx` ON `versions` (`prompt_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `versions_prompt_number_unq` ON `versions` (`prompt_id`,`number`);