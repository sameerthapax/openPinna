CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NULL,
  title text NOT NULL,
  description text NULL,
  project_summary text NULL,
  project_embedding vector(1536) NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_key date NOT NULL,
  title text NULL,
  session_summary text NULL,
  session_embedding vector(1536) NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, session_key)
);

CREATE TABLE IF NOT EXISTS sources (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'paper',
  title text NULL,
  abstract text NULL,
  authors jsonb NOT NULL DEFAULT '[]'::jsonb,
  publication_year int NULL,
  publication_date date NULL,
  venue text NULL,
  doi text NULL,
  url text NULL,
  pdf_url text NULL,
  file_path text NULL,
  original_filename text NULL,
  mime_type text NULL,
  file_size_bytes bigint NULL,
  full_text text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS captures (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  image_path text NOT NULL,
  page_number int NULL,
  x_position numeric NULL,
  y_position numeric NULL,
  selected_text text NULL,
  surrounding_text text NULL,
  caption text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  source_id uuid NULL REFERENCES sources(id) ON DELETE SET NULL,
  capture_id uuid NULL REFERENCES captures(id) ON DELETE SET NULL,
  note_text text NOT NULL,
  user_commentary text NULL,
  ai_extracted_claim text NULL,
  note_summary text NULL,
  importance_score numeric NOT NULL DEFAULT 0,
  note_embedding vector(1536) NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_threads (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  thread_type text NOT NULL,
  title text NULL,
  summary text NULL,
  embedding vector(1536) NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id uuid NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  note_id uuid NULL REFERENCES notes(id) ON DELETE SET NULL,
  thread_id uuid NULL REFERENCES chat_threads(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  content text NOT NULL,
  importance_score numeric NOT NULL DEFAULT 0,
  confidence_score numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  embedding vector(1536) NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id uuid NULL REFERENCES sessions(id) ON DELETE SET NULL,
  note_id uuid NULL REFERENCES notes(id) ON DELETE SET NULL,
  thread_id uuid NULL REFERENCES chat_threads(id) ON DELETE SET NULL,
  source_id uuid NULL REFERENCES sources(id) ON DELETE SET NULL,
  node_type text NOT NULL,
  label text NOT NULL,
  summary text NULL,
  embedding vector(1536) NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_edges (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_node_id uuid NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  to_node_id uuid NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  edge_type text NOT NULL,
  weight numeric NOT NULL DEFAULT 1,
  explanation text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_project_session_key ON sessions(project_id, session_key);
CREATE INDEX IF NOT EXISTS idx_sources_project_id ON sources(project_id);
CREATE INDEX IF NOT EXISTS idx_sources_session_id ON sources(session_id);
CREATE INDEX IF NOT EXISTS idx_notes_project_id ON notes(project_id);
CREATE INDEX IF NOT EXISTS idx_notes_session_id ON notes(session_id);
CREATE INDEX IF NOT EXISTS idx_notes_source_id ON notes(source_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_note_id ON chat_threads(note_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_session_id ON chat_threads(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON chat_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_events_project_status ON knowledge_events(project_id, status);
CREATE INDEX IF NOT EXISTS idx_knowledge_events_session_status ON knowledge_events(session_id, status);
CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_project_id ON knowledge_nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_edges_from_node_id ON knowledge_edges(from_node_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_edges_to_node_id ON knowledge_edges(to_node_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    CREATE INDEX IF NOT EXISTS idx_projects_embedding_ivfflat
      ON projects USING ivfflat (project_embedding vector_cosine_ops) WITH (lists = 100);
    CREATE INDEX IF NOT EXISTS idx_sessions_embedding_ivfflat
      ON sessions USING ivfflat (session_embedding vector_cosine_ops) WITH (lists = 100);
    CREATE INDEX IF NOT EXISTS idx_notes_embedding_ivfflat
      ON notes USING ivfflat (note_embedding vector_cosine_ops) WITH (lists = 100);
  ELSE
    RAISE NOTICE 'TODO: enable pgvector and create ivfflat indexes for embeddings.';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trigger_projects_updated_at ON projects;
CREATE TRIGGER trigger_projects_updated_at BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_sessions_updated_at ON sessions;
CREATE TRIGGER trigger_sessions_updated_at BEFORE UPDATE ON sessions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_sources_updated_at ON sources;
CREATE TRIGGER trigger_sources_updated_at BEFORE UPDATE ON sources
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_notes_updated_at ON notes;
CREATE TRIGGER trigger_notes_updated_at BEFORE UPDATE ON notes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_chat_threads_updated_at ON chat_threads;
CREATE TRIGGER trigger_chat_threads_updated_at BEFORE UPDATE ON chat_threads
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_knowledge_nodes_updated_at ON knowledge_nodes;
CREATE TRIGGER trigger_knowledge_nodes_updated_at BEFORE UPDATE ON knowledge_nodes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
