CREATE TABLE `file_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`files` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `global_filters` (
	`id` text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`include` text DEFAULT '\.tsx?$|\.py$|\.rs$|\.go$|\.lua$|\.sh$' NOT NULL,
	`exclude` text DEFAULT 'node_modules|dist|build|\.config\.|package\.json|tsconfig|\.lock$|\.ico$|\.png$|\.jpg$|\.svg$' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_dirs` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`include` text,
	`exclude` text,
	`visible` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `templates` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	`modified_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'Untitled' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`template_key` text,
	`status` text DEFAULT 'active' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`source_files` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`modified_at` integer NOT NULL
);
