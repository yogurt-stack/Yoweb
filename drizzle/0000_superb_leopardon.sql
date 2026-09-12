CREATE TABLE `original_wordings` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`text` text NOT NULL,
	`source_type` text NOT NULL,
	`source_locator` text NOT NULL,
	`extraction_method` text NOT NULL,
	`confidence` real,
	`observed_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "wording_text_valid" CHECK(length(trim("original_wordings"."text")) BETWEEN 1 AND 20000),
	CONSTRAINT "wording_locator_valid" CHECK(length(trim("original_wordings"."source_locator")) BETWEEN 1 AND 2000),
	CONSTRAINT "wording_origin_valid" CHECK("original_wordings"."source_type" IN ('SELF_CREATED','INTERVIEW','JD','PRACTICE','MODEL_GENERATED','OTHER'))
);
--> statement-breakpoint
CREATE INDEX `wordings_question_idx` ON `original_wordings` (`question_id`);--> statement-breakpoint
CREATE TABLE `question_terms` (
	`question_id` text NOT NULL,
	`term_id` text NOT NULL,
	PRIMARY KEY(`question_id`, `term_id`),
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`term_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `question_terms_term_idx` ON `question_terms` (`term_id`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`task_type` text NOT NULL,
	`status` text NOT NULL,
	`creation_method` text NOT NULL,
	`content_origin` text NOT NULL,
	`difficulty` text NOT NULL,
	`difficulty_source` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`answer` text DEFAULT '' NOT NULL,
	`hints` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "question_text_valid" CHECK(length(trim("questions"."text")) BETWEEN 1 AND 20000),
	CONSTRAINT "question_status_valid" CHECK("questions"."status" IN ('INBOX', 'ORGANIZED')),
	CONSTRAINT "question_task_valid" CHECK("questions"."task_type" IN ('EXPLAIN','DESIGN','IMPLEMENT','DEBUG','COMPARE','OTHER')),
	CONSTRAINT "question_difficulty_valid" CHECK("questions"."difficulty" IN ('UNKNOWN','EASY','MEDIUM','HARD')),
	CONSTRAINT "question_creation_valid" CHECK("questions"."creation_method" IN ('USER_CREATED','MANUAL_IMPORT','WORKFLOW_IMPORT','MODEL_GENERATED')),
	CONSTRAINT "question_origin_valid" CHECK("questions"."content_origin" IN ('SELF_CREATED','INTERVIEW','JD','PRACTICE','MODEL_GENERATED','OTHER')),
	CONSTRAINT "question_difficulty_source_valid" CHECK("questions"."difficulty_source" IN ('UNSPECIFIED','USER')),
	CONSTRAINT "question_revision_valid" CHECK("questions"."revision" > 0)
);
--> statement-breakpoint
CREATE INDEX `questions_listing_idx` ON `questions` (`archived_at`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `terms` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`parent_id` text,
	`created_by` text DEFAULT 'LOCAL_USER' NOT NULL,
	`creation_source` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "term_kind_valid" CHECK("terms"."kind" IN ('TOPIC', 'TAG')),
	CONSTRAINT "term_name_valid" CHECK(length(trim("terms"."name")) BETWEEN 1 AND 80),
	CONSTRAINT "tag_has_no_parent" CHECK("terms"."kind" = 'TOPIC' OR "terms"."parent_id" IS NULL),
	CONSTRAINT "term_not_own_parent" CHECK("terms"."parent_id" IS NULL OR "terms"."parent_id" <> "terms"."id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `term_kind_name_unique` ON `terms` (`kind`,`name_key`);