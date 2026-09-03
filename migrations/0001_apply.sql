CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT,
  scenario TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
