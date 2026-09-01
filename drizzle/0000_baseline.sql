CREATE TABLE IF NOT EXISTS `conversation_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`run_id` text,
	`sequence` integer NOT NULL,
	`kind` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "conversation_entries_kind_check" CHECK("conversation_entries"."kind" in ('user_message','assistant_message','tool_result','compaction','activity'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `conversation_entries_conversation_sequence_unique` ON `conversation_entries` (`conversation_id`,`sequence`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `conversation_entries_conversation_sequence` ON `conversation_entries` (`conversation_id`,`sequence`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `conversation_reads` (
	`conversation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`unread` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`conversation_id`, `user_id`),
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`context_summary` text DEFAULT '' NOT NULL,
	`compacted_through_id` text,
	`context_tokens` integer DEFAULT 0 NOT NULL,
	`temporary` integer DEFAULT 0 NOT NULL,
	`generation_status` text DEFAULT 'idle' NOT NULL,
	`unread` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `conversations_user_updated` ON `conversations` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `files` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `files_user_created` ON `files` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `project_invitations` (
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `user_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `project_members` (
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `user_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`system_prompt` text DEFAULT '' NOT NULL,
	`language` text DEFAULT 'Japanese' NOT NULL,
	`thinking_level` text DEFAULT 'low' NOT NULL,
	`shared` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`user_entry_id` text NOT NULL,
	`status` text NOT NULL,
	`model` text NOT NULL,
	`requested_thinking` text NOT NULL,
	`resolved_thinking` text NOT NULL,
	`turn_count` integer DEFAULT 0 NOT NULL,
	`context_tokens` integer DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "runs_status_check" CHECK("runs"."status" in ('queued','running','completed','stopped','failed'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `runs_conversation_created` ON `runs` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar` text,
	`language` text DEFAULT 'Japanese' NOT NULL,
	`ctrl_enter_send` integer DEFAULT 0 NOT NULL,
	`thinking_level` text DEFAULT 'low' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `messages` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL,
  `role` text NOT NULL,
  `content` text NOT NULL,
  `file_ids` text DEFAULT '[]' NOT NULL,
  `skills` text DEFAULT '[]' NOT NULL,
  `attachment_context` text DEFAULT '' NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TEMP TABLE `migration_guard` (`valid` integer CHECK (`valid` = 1));
--> statement-breakpoint
INSERT INTO `migration_guard`
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM `messages`
  LEFT JOIN `conversation_entries` ON `conversation_entries`.`id` = `messages`.`id`
  WHERE `conversation_entries`.`id` IS NULL
) THEN 0 ELSE 1 END;
--> statement-breakpoint
DROP TABLE `migration_guard`;
--> statement-breakpoint
DROP TABLE `messages`;
