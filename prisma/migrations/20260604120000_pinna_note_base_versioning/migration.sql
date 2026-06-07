-- AlterTable
ALTER TABLE "chat_threads" ADD COLUMN     "pinna_id" UUID;

-- CreateTable
CREATE TABLE "pinnas" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "project_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "note_id" UUID NOT NULL,
    "pinna_template_id" UUID,
    "selected_base_knowledge_version_id" UUID,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "agent_mode" TEXT,
    "agent_config" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinnas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_base_knowledge_versions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "note_id" UUID NOT NULL,
    "source_id" UUID,
    "project_id" UUID,
    "session_id" UUID,
    "version" INTEGER NOT NULL,
    "title" TEXT,
    "authors" JSONB DEFAULT '[]',
    "publication_date" TEXT,
    "abstract" TEXT,
    "summary" TEXT,
    "key_findings" TEXT NOT NULL,
    "user_view" TEXT NOT NULL,
    "conclusion" TEXT NOT NULL,
    "model" TEXT,
    "source_snapshot" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_base_knowledge_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_base_knowledge_heads" (
    "note_id" UUID NOT NULL,
    "current_version_id" UUID,
    "current_version_number" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_base_knowledge_heads_pkey" PRIMARY KEY ("note_id")
);

-- CreateTable
CREATE TABLE "pinna_knowledge_events" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "pinna_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "note_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "seq" BIGINT NOT NULL,
    "actor" TEXT,
    "message_ref" TEXT,
    "payload" JSONB,
    "supersedes_event_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importance_score" DECIMAL NOT NULL DEFAULT 0,
    "confidence_score" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinna_knowledge_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pinna_knowledge_builds" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "pinna_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "note_id" UUID NOT NULL,
    "base_knowledge_version_id" UUID NOT NULL,
    "build_version" INTEGER NOT NULL,
    "parent_build_id" UUID,
    "event_seq_from" BIGINT NOT NULL,
    "event_seq_to" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'complete',
    "generator" TEXT NOT NULL,
    "event_from_id" UUID,
    "event_to_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinna_knowledge_builds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pinna_knowledge_summaries" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "pinna_id" UUID NOT NULL,
    "build_id" UUID NOT NULL,
    "summary_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'markdown',
    "generator" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinna_knowledge_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pinna_knowledge_heads" (
    "pinna_id" UUID NOT NULL,
    "current_build_id" UUID,
    "current_event_seq" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinna_knowledge_heads_pkey" PRIMARY KEY ("pinna_id")
);

-- CreateTable
CREATE TABLE "pinna_knowledge_nodes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "pinna_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "session_id" UUID,
    "note_id" UUID,
    "source_id" UUID,
    "build_id" UUID NOT NULL,
    "stable_key" TEXT,
    "node_type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT,
    "state" TEXT,
    "confidence" DECIMAL(5,4),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinna_knowledge_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pinna_knowledge_edges" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "pinna_id" UUID NOT NULL,
    "build_id" UUID NOT NULL,
    "from_node_id" UUID NOT NULL,
    "to_node_id" UUID NOT NULL,
    "edge_type" TEXT NOT NULL,
    "weight" DECIMAL NOT NULL DEFAULT 1,
    "explanation" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinna_knowledge_edges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pinnas_note_id_created_at_idx" ON "pinnas"("note_id", "created_at");

-- CreateIndex
CREATE INDEX "pinnas_pinna_template_id_idx" ON "pinnas"("pinna_template_id");

-- CreateIndex
CREATE INDEX "pinnas_selected_base_knowledge_version_id_idx" ON "pinnas"("selected_base_knowledge_version_id");

-- CreateIndex
CREATE INDEX "note_base_knowledge_versions_note_id_created_at_idx" ON "note_base_knowledge_versions"("note_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "note_base_knowledge_versions_note_id_version_key" ON "note_base_knowledge_versions"("note_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "note_base_knowledge_heads_current_version_id_key" ON "note_base_knowledge_heads"("current_version_id");

-- CreateIndex
CREATE INDEX "pinna_knowledge_events_note_id_created_at_idx" ON "pinna_knowledge_events"("note_id", "created_at");

-- CreateIndex
CREATE INDEX "pinna_knowledge_events_pinna_id_created_at_idx" ON "pinna_knowledge_events"("pinna_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pinna_knowledge_events_pinna_id_seq_key" ON "pinna_knowledge_events"("pinna_id", "seq");

-- CreateIndex
CREATE INDEX "pinna_knowledge_builds_pinna_id_created_at_idx" ON "pinna_knowledge_builds"("pinna_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pinna_knowledge_builds_pinna_id_build_version_key" ON "pinna_knowledge_builds"("pinna_id", "build_version");

-- CreateIndex
CREATE INDEX "pinna_knowledge_summaries_pinna_id_created_at_idx" ON "pinna_knowledge_summaries"("pinna_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pinna_knowledge_summaries_build_id_summary_type_key" ON "pinna_knowledge_summaries"("build_id", "summary_type");

-- CreateIndex
CREATE INDEX "pinna_knowledge_nodes_pinna_id_build_id_idx" ON "pinna_knowledge_nodes"("pinna_id", "build_id");

-- CreateIndex
CREATE UNIQUE INDEX "pinna_knowledge_nodes_build_id_stable_key_key" ON "pinna_knowledge_nodes"("build_id", "stable_key");

-- CreateIndex
CREATE INDEX "pinna_knowledge_edges_build_id_edge_type_idx" ON "pinna_knowledge_edges"("build_id", "edge_type");

-- CreateIndex
CREATE INDEX "pinna_knowledge_edges_from_node_id_idx" ON "pinna_knowledge_edges"("from_node_id");

-- CreateIndex
CREATE INDEX "pinna_knowledge_edges_to_node_id_idx" ON "pinna_knowledge_edges"("to_node_id");

-- CreateIndex
CREATE INDEX "chat_threads_pinna_id_idx" ON "chat_threads"("pinna_id");

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_pinna_id_fkey" FOREIGN KEY ("pinna_id") REFERENCES "pinnas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinnas" ADD CONSTRAINT "pinnas_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinnas" ADD CONSTRAINT "pinnas_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinnas" ADD CONSTRAINT "pinnas_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinnas" ADD CONSTRAINT "pinnas_pinna_template_id_fkey" FOREIGN KEY ("pinna_template_id") REFERENCES "pinna_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinnas" ADD CONSTRAINT "pinnas_selected_base_knowledge_version_id_fkey" FOREIGN KEY ("selected_base_knowledge_version_id") REFERENCES "note_base_knowledge_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_base_knowledge_versions" ADD CONSTRAINT "note_base_knowledge_versions_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_base_knowledge_versions" ADD CONSTRAINT "note_base_knowledge_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_base_knowledge_versions" ADD CONSTRAINT "note_base_knowledge_versions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_base_knowledge_versions" ADD CONSTRAINT "note_base_knowledge_versions_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_base_knowledge_heads" ADD CONSTRAINT "note_base_knowledge_heads_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_base_knowledge_heads" ADD CONSTRAINT "note_base_knowledge_heads_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "note_base_knowledge_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_events" ADD CONSTRAINT "pinna_knowledge_events_pinna_id_fkey" FOREIGN KEY ("pinna_id") REFERENCES "pinnas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_events" ADD CONSTRAINT "pinna_knowledge_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_events" ADD CONSTRAINT "pinna_knowledge_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_events" ADD CONSTRAINT "pinna_knowledge_events_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_events" ADD CONSTRAINT "pinna_knowledge_events_supersedes_event_id_fkey" FOREIGN KEY ("supersedes_event_id") REFERENCES "pinna_knowledge_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_builds" ADD CONSTRAINT "pinna_knowledge_builds_pinna_id_fkey" FOREIGN KEY ("pinna_id") REFERENCES "pinnas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_builds" ADD CONSTRAINT "pinna_knowledge_builds_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_builds" ADD CONSTRAINT "pinna_knowledge_builds_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_builds" ADD CONSTRAINT "pinna_knowledge_builds_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_builds" ADD CONSTRAINT "pinna_knowledge_builds_base_knowledge_version_id_fkey" FOREIGN KEY ("base_knowledge_version_id") REFERENCES "note_base_knowledge_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_builds" ADD CONSTRAINT "pinna_knowledge_builds_parent_build_id_fkey" FOREIGN KEY ("parent_build_id") REFERENCES "pinna_knowledge_builds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_builds" ADD CONSTRAINT "pinna_knowledge_builds_event_from_id_fkey" FOREIGN KEY ("event_from_id") REFERENCES "pinna_knowledge_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_builds" ADD CONSTRAINT "pinna_knowledge_builds_event_to_id_fkey" FOREIGN KEY ("event_to_id") REFERENCES "pinna_knowledge_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_summaries" ADD CONSTRAINT "pinna_knowledge_summaries_pinna_id_fkey" FOREIGN KEY ("pinna_id") REFERENCES "pinnas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_summaries" ADD CONSTRAINT "pinna_knowledge_summaries_build_id_fkey" FOREIGN KEY ("build_id") REFERENCES "pinna_knowledge_builds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_heads" ADD CONSTRAINT "pinna_knowledge_heads_pinna_id_fkey" FOREIGN KEY ("pinna_id") REFERENCES "pinnas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_heads" ADD CONSTRAINT "pinna_knowledge_heads_current_build_id_fkey" FOREIGN KEY ("current_build_id") REFERENCES "pinna_knowledge_builds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_nodes" ADD CONSTRAINT "pinna_knowledge_nodes_pinna_id_fkey" FOREIGN KEY ("pinna_id") REFERENCES "pinnas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_nodes" ADD CONSTRAINT "pinna_knowledge_nodes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_nodes" ADD CONSTRAINT "pinna_knowledge_nodes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_nodes" ADD CONSTRAINT "pinna_knowledge_nodes_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_nodes" ADD CONSTRAINT "pinna_knowledge_nodes_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_nodes" ADD CONSTRAINT "pinna_knowledge_nodes_build_id_fkey" FOREIGN KEY ("build_id") REFERENCES "pinna_knowledge_builds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_edges" ADD CONSTRAINT "pinna_knowledge_edges_pinna_id_fkey" FOREIGN KEY ("pinna_id") REFERENCES "pinnas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_edges" ADD CONSTRAINT "pinna_knowledge_edges_build_id_fkey" FOREIGN KEY ("build_id") REFERENCES "pinna_knowledge_builds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_edges" ADD CONSTRAINT "pinna_knowledge_edges_from_node_id_fkey" FOREIGN KEY ("from_node_id") REFERENCES "pinna_knowledge_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_knowledge_edges" ADD CONSTRAINT "pinna_knowledge_edges_to_node_id_fkey" FOREIGN KEY ("to_node_id") REFERENCES "pinna_knowledge_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
