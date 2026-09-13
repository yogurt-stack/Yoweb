CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `company_name_unique` ON `companies` (`name_key`);--> statement-breakpoint
CREATE TABLE `raw_document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text NOT NULL,
	`full_text` text NOT NULL,
	`notes` text NOT NULL,
	`local_policy` text NOT NULL,
	`llm_policy` text NOT NULL,
	`observed_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `raw_documents`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "version_storage_scope_valid" CHECK(("raw_document_versions"."local_policy" = 'METADATA_ONLY' AND "raw_document_versions"."excerpt" = '' AND "raw_document_versions"."full_text" = '') OR ("raw_document_versions"."local_policy" = 'EXCERPT' AND "raw_document_versions"."full_text" = '') OR "raw_document_versions"."local_policy" = 'FULL')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_fingerprint_unique` ON `raw_document_versions` (`document_id`,`fingerprint`);--> statement-breakpoint
CREATE TABLE `raw_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`canonical_url` text NOT NULL,
	`content_origin` text NOT NULL,
	`current_version_id` text,
	`status` text DEFAULT 'VALID' NOT NULL,
	`first_observed_at` text NOT NULL,
	`last_checked_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`current_version_id`) REFERENCES `raw_document_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "document_origin_valid" CHECK("raw_documents"."content_origin" IN ('SELF_CREATED','INTERVIEW','JD','PRACTICE','MODEL_GENERATED','OTHER')),
	CONSTRAINT "document_status_valid" CHECK("raw_documents"."status" IN ('VALID','UNAVAILABLE','NEEDS_CHECK','PROHIBITED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_url_unique` ON `raw_documents` (`canonical_url`);--> statement-breakpoint
CREATE INDEX `document_source_idx` ON `raw_documents` (`source_id`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`document_version_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`source_url` text NOT NULL,
	`scope` text NOT NULL,
	`excerpt` text NOT NULL,
	`personal_note` text NOT NULL,
	`locator` text NOT NULL,
	`observed_at` text NOT NULL,
	`local_policy` text NOT NULL,
	`llm_policy` text NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`document_version_id`) REFERENCES `raw_document_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "evidence_scope_valid" CHECK(("evidence"."scope" = 'LINK' AND "evidence"."excerpt" = '') OR ("evidence"."scope" = 'EXCERPT' AND length(trim("evidence"."excerpt")) > 0 AND "evidence"."local_policy" <> 'METADATA_ONLY'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_fingerprint_unique` ON `evidence` (`question_id`,`document_version_id`,`fingerprint`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`document_version_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_version_id`) REFERENCES `raw_document_versions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `batch_fingerprint_unique` ON `import_batches` (`fingerprint`);--> statement-breakpoint
CREATE TABLE `import_items` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`proposed_text` text NOT NULL,
	`task_type` text NOT NULL,
	`original_text` text NOT NULL,
	`locator` text NOT NULL,
	`fingerprint` text NOT NULL,
	`status` text DEFAULT 'REVIEW_PENDING' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`accepted_question_id` text,
	`evidence_id` text,
	`decision_fingerprint` text,
	`reviewed_at` text,
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`accepted_question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`evidence_id`) REFERENCES `evidence`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "item_status_valid" CHECK("import_items"."status" IN ('REVIEW_PENDING','ACCEPTED','EDITED','IGNORED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_batch_fingerprint_unique` ON `import_items` (`batch_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `item_status_idx` ON `import_items` (`status`);--> statement-breakpoint
CREATE TABLE `interview_occurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`interview_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	`report_note` text NOT NULL,
	`confirmed_by` text DEFAULT 'LOCAL_USER' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`interview_id`) REFERENCES `interviews`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`evidence_id`) REFERENCES `evidence`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `occurrence_question_interview_unique` ON `interview_occurrences` (`question_id`,`interview_id`);--> statement-breakpoint
CREATE TABLE `interviews` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`report_key` text NOT NULL,
	`report_key_normalized` text NOT NULL,
	`company_id` text,
	`job_id` text,
	`date_from` text,
	`date_to` text,
	`round` text NOT NULL,
	`credibility` text NOT NULL,
	`notes` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `raw_documents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "interview_date_range_valid" CHECK("interviews"."date_to" IS NULL OR ("interviews"."date_from" IS NOT NULL AND "interviews"."date_to" >= "interviews"."date_from"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interview_document_report_unique` ON `interviews` (`document_id`,`report_key_normalized`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`title` text NOT NULL,
	`url` text,
	`document_id` text,
	`identity_key` text NOT NULL,
	`observed_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`document_id`) REFERENCES `raw_documents`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_identity_unique` ON `jobs` (`identity_key`);--> statement-breakpoint
CREATE TABLE `question_mentions` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`document_id` text NOT NULL,
	`first_evidence_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`document_id`) REFERENCES `raw_documents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`first_evidence_id`) REFERENCES `evidence`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mention_question_document_unique` ON `question_mentions` (`question_id`,`document_id`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`host` text NOT NULL,
	`acquisition_method` text DEFAULT 'MANUAL' NOT NULL,
	`rules_status` text NOT NULL,
	`policy_note` text NOT NULL,
	`local_policy` text NOT NULL,
	`llm_policy` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "source_local_policy_valid" CHECK("sources"."local_policy" IN ('METADATA_ONLY','EXCERPT','FULL')),
	CONSTRAINT "source_llm_policy_valid" CHECK("sources"."llm_policy" IN ('UNKNOWN','DENY','ALLOW'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_host_type_unique` ON `sources` (`host`,`type`);--> statement-breakpoint
ALTER TABLE `original_wordings` ADD `evidence_id` text REFERENCES evidence(id);