CREATE TABLE IF NOT EXISTS `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`instructions` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `skills_user_name_unique` ON `skills` (`user_id`,`name`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `skills_user_updated` ON `skills` (`user_id`,`updated_at`);