"""SQLite storage for Acadrix: schema, demo seed data and row helpers."""
import json
import sqlite3
from pathlib import Path

from flask import g
from werkzeug.security import generate_password_hash

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / 'instance' / 'acadrix.db'

SUBJECTS = ['Mathematics', 'Physics', 'Programming', 'DBMS', 'English']
BASE_HELD = 60            # classes held so far this semester for the demo data
DEFAULT_PASSWORD = 'student@123'

SCHEMA = """
CREATE TABLE IF NOT EXISTS teachers (
  username TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dept TEXT NOT NULL,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  section TEXT NOT NULL,
  attendance INTEGER NOT NULL,
  assignment INTEGER NOT NULL,
  prev_score INTEGER NOT NULL,
  study_hours INTEGER NOT NULL,
  marks TEXT NOT NULL,              -- JSON {subject: mark}
  held INTEGER NOT NULL,
  attended INTEGER NOT NULL,
  goal INTEGER,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  user_id TEXT NOT NULL,
  expires_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL,
  important INTEGER NOT NULL DEFAULT 0,
  date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notice_seen (
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  notice_id INTEGER NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  PRIMARY KEY (student_id, notice_id)
);
CREATE TABLE IF NOT EXISTS attendance (
  date TEXT NOT NULL,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  present INTEGER NOT NULL,
  PRIMARY KEY (date, student_id)
);
"""

# id, name, section, attendance, assignment, [subject marks], prev score, study hours
DEMO_STUDENTS = [
    ('STU101', 'Aarav Sharma', 'A', 92, 88, [85, 78, 94, 88, 80], 82, 14),
    ('STU102', 'Diya Patel', 'A', 96, 94, [92, 89, 90, 93, 91], 90, 18),
    ('STU103', 'Kabir Singh', 'B', 64, 55, [48, 52, 60, 55, 62], 58, 6),
    ('STU104', 'Ananya Gupta', 'A', 85, 80, [78, 74, 82, 80, 86], 76, 12),
    ('STU105', 'Rohan Mehta', 'B', 58, 42, [40, 38, 50, 45, 55], 47, 4),
    ('STU106', 'Ishita Verma', 'A', 89, 91, [88, 82, 86, 90, 92], 85, 15),
    ('STU107', 'Vivaan Yadav', 'B', 72, 68, [70, 62, 74, 66, 64], 68, 9),
    ('STU108', 'Saanvi Mishra', 'A', 94, 86, [90, 88, 84, 86, 78], 88, 16),
    ('STU109', 'Arjun Tiwari', 'B', 68, 60, [55, 58, 72, 60, 58], 62, 8),
    ('STU110', 'Meera Joshi', 'A', 81, 77, [74, 70, 80, 78, 84], 72, 11),
    ('STU111', 'Aditya Kumar', 'B', 52, 48, [42, 45, 38, 50, 48], 44, 5),
    ('STU112', 'Priya Srivastava', 'A', 87, 84, [82, 80, 88, 84, 90], 80, 13),
]

DEMO_TEACHERS = [('teacher', 'Dr. Anjali Verma', 'Computer Science & Engg.', 'teacher@123')]

DEMO_NOTICES = [
    ('Mid-semester exams from 20 October', 'Mid-sem exams for all subjects start on 20 October. The detailed timetable is on the department notice board.', 'all', 1, '2026-10-06'),
    ('DBMS Assignment 3 deadline extended', 'The deadline for DBMS Assignment 3 has been extended to 15 October, 11:59 PM.', 'all', 0, '2026-10-04'),
    ('Extra Physics doubt session', 'An extra doubt-clearing session for Physics will be held on Saturday at 10 AM in Room 204.', 'B', 0, '2026-10-02'),
]


def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def get_db():
    if 'db' not in g:
        g.db = connect()
    return g.db


def close_db(_exc=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()


def seed_students(conn):
    conn.execute('DELETE FROM attendance')
    conn.execute('DELETE FROM students')
    pw = generate_password_hash(DEFAULT_PASSWORD)
    for sid, name, sec, att, asg, marks, prev, study in DEMO_STUDENTS:
        conn.execute(
            'INSERT INTO students (id, name, section, attendance, assignment, prev_score, study_hours, marks, held, attended, goal, password_hash) '
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)',
            (sid, name, sec, att, asg, prev, study, json.dumps(dict(zip(SUBJECTS, marks))),
             BASE_HELD, round(att / 100 * BASE_HELD), pw))


def init_db():
    with connect() as conn:
        conn.executescript(SCHEMA)
        if not conn.execute('SELECT 1 FROM teachers LIMIT 1').fetchone():
            for username, name, dept, password in DEMO_TEACHERS:
                conn.execute('INSERT INTO teachers VALUES (?, ?, ?, ?)', (username, name, dept, generate_password_hash(password)))
            seed_students(conn)
            conn.executemany('INSERT INTO notices (title, body, audience, important, date) VALUES (?, ?, ?, ?, ?)', DEMO_NOTICES)


def student_to_dict(row):
    return {
        'id': row['id'], 'name': row['name'], 'section': row['section'],
        'attendance': row['attendance'], 'assignment': row['assignment'],
        'prevScore': row['prev_score'], 'studyHours': row['study_hours'],
        'marks': json.loads(row['marks']), 'held': row['held'], 'attended': row['attended'],
        'goal': row['goal'],
    }


def notice_to_dict(row):
    return {'id': str(row['id']), 'title': row['title'], 'body': row['body'], 'audience': row['audience'],
            'important': bool(row['important']), 'date': row['date']}
