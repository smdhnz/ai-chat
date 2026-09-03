CREATE TABLE `project_skills` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`instructions` text NOT NULL,
	`files` text DEFAULT '[]' NOT NULL,
	`source_id` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_skills_project_name_unique` ON `project_skills` (`project_id`,`name`);--> statement-breakpoint
CREATE INDEX `project_skills_project_updated` ON `project_skills` (`project_id`,`updated_at`);--> statement-breakpoint
ALTER TABLE `skills` ADD `files` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `skills` ADD `source_id` text;