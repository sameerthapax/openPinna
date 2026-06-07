-- CreateEnum
CREATE TYPE "AgentScope" AS ENUM ('PROJECT', 'SESSION', 'NOTE');

-- AlterTable
ALTER TABLE "pinna_templates" ADD COLUMN     "allow_shell" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "default_skill_key" TEXT,
ADD COLUMN     "display_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "scope" "AgentScope" NOT NULL DEFAULT 'NOTE';

-- CreateTable
CREATE TABLE "pinna_skills" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "scope" "AgentScope" NOT NULL,
    "version" TEXT NOT NULL,
    "default_model" TEXT NOT NULL,
    "requires_shell" BOOLEAN NOT NULL DEFAULT false,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "skill_path" TEXT NOT NULL,
    "runtime_path" TEXT NOT NULL,
    "manifest_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinna_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pinna_template_skills" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "pinna_template_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinna_template_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_tools" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "schema_json" JSONB NOT NULL,
    "handler_name" TEXT NOT NULL,
    "scope" "AgentScope",
    "requires_shell" BOOLEAN NOT NULL DEFAULT false,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pinna_skill_tools" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "skill_id" UUID NOT NULL,
    "tool_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinna_skill_tools_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pinna_skills_key_key" ON "pinna_skills"("key");

-- CreateIndex
CREATE INDEX "pinna_template_skills_skill_id_idx" ON "pinna_template_skills"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "pinna_template_skills_pinna_template_id_skill_id_key" ON "pinna_template_skills"("pinna_template_id", "skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_tools_key_key" ON "agent_tools"("key");

-- CreateIndex
CREATE INDEX "pinna_skill_tools_tool_id_idx" ON "pinna_skill_tools"("tool_id");

-- CreateIndex
CREATE UNIQUE INDEX "pinna_skill_tools_skill_id_tool_id_key" ON "pinna_skill_tools"("skill_id", "tool_id");

-- AddForeignKey
ALTER TABLE "pinna_templates" ADD CONSTRAINT "pinna_templates_default_skill_key_fkey" FOREIGN KEY ("default_skill_key") REFERENCES "pinna_skills"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_template_skills" ADD CONSTRAINT "pinna_template_skills_pinna_template_id_fkey" FOREIGN KEY ("pinna_template_id") REFERENCES "pinna_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_template_skills" ADD CONSTRAINT "pinna_template_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "pinna_skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_skill_tools" ADD CONSTRAINT "pinna_skill_tools_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "pinna_skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinna_skill_tools" ADD CONSTRAINT "pinna_skill_tools_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "agent_tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
