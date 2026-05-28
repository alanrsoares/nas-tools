CREATE TABLE `move_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`config` text NOT NULL,
	`cue_split_enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `move_plan_items` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`status` text NOT NULL,
	`media_type` text NOT NULL,
	`source_path` text NOT NULL,
	`target_path` text NOT NULL,
	`artist_name` text,
	`album_name` text NOT NULL,
	`is_new_artist` integer,
	`included` integer DEFAULT true NOT NULL,
	`issues` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `move_plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`plan_id` text,
	`counts` text DEFAULT '{}' NOT NULL,
	`started_at` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `move_plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `job_events` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`seq` integer NOT NULL,
	`type` text NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`data` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
