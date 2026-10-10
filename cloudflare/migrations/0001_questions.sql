CREATE TABLE IF NOT EXISTS sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  year INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS packets (
  id TEXT PRIMARY KEY,
  set_id TEXT NOT NULL REFERENCES sets(id),
  number INTEGER NOT NULL,
  data TEXT NOT NULL,
  UNIQUE(set_id, number)
);
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('tossup', 'bonus')),
  ordinal INTEGER NOT NULL,
  packet_id TEXT NOT NULL REFERENCES packets(id),
  number INTEGER NOT NULL,
  category TEXT NOT NULL,
  year INTEGER NOT NULL,
  set_name TEXT NOT NULL,
  question_text TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  data TEXT NOT NULL,
  UNIQUE(kind, ordinal),
  UNIQUE(packet_id, kind, number)
);
CREATE INDEX IF NOT EXISTS questions_filter ON questions(kind, category, year);
CREATE INDEX IF NOT EXISTS questions_set ON questions(set_name, kind);
CREATE TABLE IF NOT EXISTS question_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT NOT NULL REFERENCES questions(id),
  reason TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
