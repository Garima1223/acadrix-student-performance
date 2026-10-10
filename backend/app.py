"""Acadrix — Flask backend.

Serves the frontend and a JSON API backed by SQLite and the trained model.

Run from the project folder:
    python backend/app.py
then open http://localhost:5000
"""
import json
import math
import os
import re
import secrets
import sys
import time
from collections import defaultdict, deque
from datetime import date
from functools import wraps
from pathlib import Path

from flask import Flask, abort, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.database import (DEFAULT_PASSWORD, BASE_HELD, SUBJECTS, close_db, get_db, init_db,  # noqa: E402
                              notice_to_dict, seed_students, student_to_dict)
from ml.features import FEATURES, FIGURES_DIR, METRICS_PATH, MODEL_PATH  # noqa: E402

SESSION_TTL = 7 * 24 * 3600
LOGIN_LIMIT, LOGIN_WINDOW = 10, 300          # 10 failed attempts per 5 minutes per IP
ID_RE = re.compile(r'^[A-Z0-9_-]{3,20}$')
SECTION_RE = re.compile(r'^[A-Z]{1,3}$')
DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')

app = Flask(__name__, static_folder=str(ROOT / 'frontend'), static_url_path='')
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024
app.teardown_appcontext(close_db)

_predictor = None
_failed_logins = defaultdict(deque)


# ---------------------------------------------------------------- helpers
class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message, self.status = message, status


@app.errorhandler(ApiError)
def handle_api_error(err):
    return jsonify(error=err.message), err.status


@app.errorhandler(413)
def too_large(_err):
    return jsonify(error='That upload is too large (2 MB max).'), 413


def predictor():
    global _predictor
    if _predictor is None:
        if not MODEL_PATH.exists():
            raise ApiError('No trained model yet. Run "python -m ml.generate_dataset" and "python -m ml.train" first.', 503)
        from ml.predictor import Predictor
        _predictor = Predictor()
    return _predictor


def body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError('Expected a JSON body.')
    return data


def int_in(value, lo, hi, label):
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ApiError(f'{label} must be a number.')
    if not math.isfinite(number) or not lo <= number <= hi:
        raise ApiError(f'{label} must be between {lo} and {hi}.')
    return round(number)


def features_of(student):
    marks = student['marks']
    return {
        'attendance': student['attendance'], 'assignment': student['assignment'],
        'internal': round(sum(marks[s] for s in SUBJECTS) / len(SUBJECTS)),
        'prevScore': student['prevScore'], 'studyHours': student['studyHours'],
    }


def with_predictions(students):
    preds = predictor().predict([features_of(s) for s in students])
    for s, p in zip(students, preds):
        s['prediction'] = p
    return students


def all_students():
    rows = get_db().execute('SELECT * FROM students ORDER BY id').fetchall()
    return with_predictions([student_to_dict(r) for r in rows])


def one_student(sid):
    row = get_db().execute('SELECT * FROM students WHERE id = ?', (sid,)).fetchone()
    if not row:
        raise ApiError('Student not found.', 404)
    return with_predictions([student_to_dict(row)])[0]


def attendance_log():
    log = defaultdict(dict)
    for row in get_db().execute('SELECT date, student_id, present FROM attendance'):
        log[row['date']][row['student_id']] = bool(row['present'])
    return log


def model_info():
    if not METRICS_PATH.exists():
        return {'available': False}
    info = json.loads(METRICS_PATH.read_text())
    info['available'] = MODEL_PATH.exists()
    info['deployed'] = info.get('best')
    return info


# ---------------------------------------------------------------- auth
def auth_required(role=None):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            header = request.headers.get('Authorization', '')
            token = header[7:] if header.startswith('Bearer ') else ''
            row = get_db().execute('SELECT role, user_id FROM sessions WHERE token = ? AND expires_at > ?',
                                   (token, time.time())).fetchone() if token else None
            if not row:
                raise ApiError('Your session has ended. Please sign in again.', 401)
            if role and row['role'] != role:
                raise ApiError("You don't have access to that.", 403)
            g.role, g.user_id = row['role'], row['user_id']
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def too_many_failures(ip):
    attempts = _failed_logins[ip]
    while attempts and attempts[0] < time.time() - LOGIN_WINDOW:
        attempts.popleft()
    return len(attempts) >= LOGIN_LIMIT


@app.post('/api/auth/login')
def login():
    data = body()
    ip = request.remote_addr or '?'
    if too_many_failures(ip):
        raise ApiError('Too many attempts. Please wait a few minutes and try again.', 429)
    role, username, password = data.get('role'), str(data.get('username', '')).strip(), str(data.get('password', ''))
    db = get_db()
    if role == 'teacher':
        row = db.execute('SELECT username AS id, password_hash FROM teachers WHERE lower(username) = lower(?)', (username,)).fetchone()
    elif role == 'student':
        row = db.execute('SELECT id, password_hash FROM students WHERE lower(id) = lower(?)', (username,)).fetchone()
    else:
        raise ApiError('Unknown role.')
    if not row or not check_password_hash(row['password_hash'], password):
        _failed_logins[ip].append(time.time())
        raise ApiError("That username and password don't match.", 401)
    token = secrets.token_urlsafe(32)
    db.execute('DELETE FROM sessions WHERE expires_at < ?', (time.time(),))
    db.execute('INSERT INTO sessions VALUES (?, ?, ?, ?)', (token, role, row['id'], time.time() + SESSION_TTL))
    db.commit()
    return jsonify(token=token, role=role, id=row['id'])


@app.post('/api/auth/logout')
@auth_required()
def logout():
    token = request.headers['Authorization'][7:]
    get_db().execute('DELETE FROM sessions WHERE token = ?', (token,))
    get_db().commit()
    return jsonify(ok=True)


# ---------------------------------------------------------------- bootstrap
@app.get('/api/bootstrap')
@auth_required()
def bootstrap():
    db = get_db()
    if g.role == 'teacher':
        t = db.execute('SELECT username, name, dept FROM teachers WHERE username = ?', (g.user_id,)).fetchone()
        notices = [notice_to_dict(r) for r in db.execute('SELECT * FROM notices ORDER BY date DESC, id DESC')]
        return jsonify(role='teacher', user=dict(t), students=all_students(), notices=notices,
                       attLog=attendance_log(), model=model_info())

    students = all_students()
    me = next(s for s in students if s['id'] == g.user_id)
    ranked = sorted(students, key=lambda s: -s['prediction']['score'])
    class_stats = {
        'size': len(students),
        'rank': ranked.index(me) + 1,
        'subjectAvg': {sub: sum(s['marks'][sub] for s in students) / len(students) for sub in SUBJECTS},
        'internalAvg': sum(sum(s['marks'].values()) / len(SUBJECTS) for s in students) / len(students),
    }
    seen = {r['notice_id'] for r in db.execute('SELECT notice_id FROM notice_seen WHERE student_id = ?', (me['id'],))}
    notices = []
    for r in db.execute("SELECT * FROM notices WHERE audience IN ('all', ?) ORDER BY date DESC, id DESC", (me['section'],)):
        n = notice_to_dict(r)
        n['seen'] = r['id'] in seen
        notices.append(n)
    return jsonify(role='student', user=me, students=[me], classStats=class_stats, notices=notices, model=model_info())


# ---------------------------------------------------------------- model
@app.get('/api/model')
@auth_required()
def model():
    return jsonify(model_info())


@app.get('/api/figures/<path:name>')
@auth_required('teacher')
def figure(name):
    if not name.endswith('.png'):
        abort(404)
    return send_from_directory(FIGURES_DIR, name)


def clean_features(raw):
    if not isinstance(raw, dict):
        raise ApiError('Each feature set must be an object.')
    return {key: int_in(raw.get(key), lo, hi, label) for key, (_col, label, (lo, hi)) in FEATURES.items()}


@app.post('/api/predict')
@auth_required()
def predict():
    rows = body().get('features')
    if not isinstance(rows, list) or not 1 <= len(rows) <= 500:
        raise ApiError('Send between 1 and 500 feature sets.')
    return jsonify(predictions=predictor().predict([clean_features(r) for r in rows]), model=predictor().name)


@app.post('/api/goal-plan')
@auth_required('student')
def goal_plan():
    goal = int_in(body().get('goal'), 1, 100, 'Goal')
    return jsonify(predictor().goal_plan(features_of(one_student(g.user_id)), goal))


# ---------------------------------------------------------------- students (teacher)
def clean_student(data, creating):
    out = {}
    sid = str(data.get('id', '')).strip().upper()
    if creating and not ID_RE.match(sid):
        raise ApiError('Student ID must be 3–20 letters or numbers.')
    out['id'] = sid
    name = str(data.get('name', '')).strip()
    if not 1 <= len(name) <= 80:
        raise ApiError('Please enter the student name (up to 80 characters).')
    out['name'] = name
    section = str(data.get('section') or 'A').strip().upper()
    if not SECTION_RE.match(section):
        raise ApiError('Section must be 1–3 letters.')
    out['section'] = section
    out['attendance'] = int_in(data.get('attendance'), 0, 100, 'Attendance')
    out['assignment'] = int_in(data.get('assignment'), 0, 100, 'Assignment score')
    out['prevScore'] = int_in(data.get('prevScore'), 0, 100, 'Previous semester score')
    out['studyHours'] = int_in(data.get('studyHours'), 0, 30, 'Study hours')
    marks = data.get('marks')
    if not isinstance(marks, dict):
        raise ApiError('Marks are missing.')
    out['marks'] = {sub: int_in(marks.get(sub), 0, 100, sub) for sub in SUBJECTS}
    password = data.get('password') or ''
    if creating and not password:
        password = DEFAULT_PASSWORD
    if password and len(password) < 6:
        raise ApiError('Password must be at least 6 characters.')
    out['password'] = password
    return out


def upsert_student(clean, existing):
    db = get_db()
    held = existing['held'] if existing else BASE_HELD
    values = (clean['name'], clean['section'], clean['attendance'], clean['assignment'], clean['prevScore'],
              clean['studyHours'], json.dumps(clean['marks']), held, round(clean['attendance'] / 100 * held))
    if existing:
        db.execute('UPDATE students SET name=?, section=?, attendance=?, assignment=?, prev_score=?, study_hours=?, '
                   'marks=?, held=?, attended=? WHERE id=?', values + (existing['id'],))
        if clean['password']:
            db.execute('UPDATE students SET password_hash=? WHERE id=?', (generate_password_hash(clean['password']), existing['id']))
    else:
        db.execute('INSERT INTO students (name, section, attendance, assignment, prev_score, study_hours, marks, held, attended, '
                   'password_hash, id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                   values + (generate_password_hash(clean['password']), clean['id']))


def find_student(sid):
    return get_db().execute('SELECT * FROM students WHERE lower(id) = lower(?)', (sid,)).fetchone()


@app.get('/api/students')
@auth_required('teacher')
def list_students():
    return jsonify(students=all_students())


@app.post('/api/students')
@auth_required('teacher')
def create_student():
    clean = clean_student(body(), creating=True)
    if find_student(clean['id']):
        raise ApiError('That Student ID already exists.', 409)
    upsert_student(clean, None)
    get_db().commit()
    return jsonify(student=one_student(clean['id'])), 201


@app.put('/api/students/<sid>')
@auth_required('teacher')
def update_student(sid):
    existing = find_student(sid)
    if not existing:
        raise ApiError('Student not found.', 404)
    upsert_student(clean_student(body(), creating=False), existing)
    get_db().commit()
    return jsonify(student=one_student(existing['id']))


@app.delete('/api/students/<sid>')
@auth_required('teacher')
def delete_student(sid):
    db = get_db()
    if not find_student(sid):
        raise ApiError('Student not found.', 404)
    db.execute("DELETE FROM sessions WHERE role = 'student' AND lower(user_id) = lower(?)", (sid,))
    db.execute('DELETE FROM students WHERE lower(id) = lower(?)', (sid,))
    db.commit()
    return jsonify(ok=True)


@app.post('/api/students/bulk')
@auth_required('teacher')
def bulk_students():
    rows = body().get('rows')
    if not isinstance(rows, list) or not rows or len(rows) > 2000:
        raise ApiError('Send between 1 and 2000 rows.')
    added = updated = 0
    skipped = []
    for i, row in enumerate(rows, start=2):           # row 1 is the CSV header
        try:
            existing = find_student(str(row.get('id', '')))
            if existing and not row.get('section'):
                row['section'] = existing['section']
            clean = clean_student(row, creating=not existing)
            upsert_student(clean, existing)
            updated += bool(existing)
            added += not existing
        except (ApiError, AttributeError) as err:
            skipped.append({'row': i, 'reason': getattr(err, 'message', 'Invalid row')})
    get_db().commit()
    return jsonify(added=added, updated=updated, skipped=skipped[:20], skippedCount=len(skipped), students=all_students())


@app.post('/api/students/reset')
@auth_required('teacher')
def reset_students():
    db = get_db()
    db.execute("DELETE FROM sessions WHERE role = 'student'")
    seed_students(db)
    db.commit()
    return jsonify(students=all_students(), attLog={})


# ---------------------------------------------------------------- attendance (teacher)
@app.get('/api/attendance')
@auth_required('teacher')
def get_attendance():
    return jsonify(attLog=attendance_log())


@app.post('/api/attendance')
@auth_required('teacher')
def save_attendance():
    data = body()
    day = str(data.get('date', ''))
    if not DATE_RE.match(day):
        raise ApiError('Please pick a valid date.')
    try:
        if date.fromisoformat(day) > date.today():
            raise ApiError("You can't mark attendance for a future date.")
    except ValueError:
        raise ApiError('Please pick a valid date.')
    records = data.get('records')
    if not isinstance(records, dict) or not records:
        raise ApiError('No students to mark.')
    db = get_db()
    marked = 0
    for sid, present in records.items():
        s = db.execute('SELECT id, held, attended FROM students WHERE id = ?', (sid,)).fetchone()
        if not s:
            continue
        held, attended = s['held'], s['attended']
        prev = db.execute('SELECT present FROM attendance WHERE date = ? AND student_id = ?', (day, sid)).fetchone()
        if prev:                                       # re-marking a day replaces the earlier record
            held -= 1
            attended -= prev['present']
        held += 1
        attended += 1 if present else 0
        db.execute('UPDATE students SET held=?, attended=?, attendance=? WHERE id=?',
                   (held, attended, round(attended / held * 100), sid))
        db.execute('INSERT OR REPLACE INTO attendance VALUES (?, ?, ?)', (day, sid, 1 if present else 0))
        marked += 1
    db.commit()
    return jsonify(marked=marked, students=all_students(), attLog=attendance_log())


# ---------------------------------------------------------------- notices
@app.post('/api/notices')
@auth_required('teacher')
def create_notice():
    data = body()
    title, text = str(data.get('title', '')).strip(), str(data.get('body', '')).strip()
    audience = str(data.get('audience', 'all'))
    if not title or not text:
        raise ApiError('Please add a title and a message.')
    if len(title) > 90 or len(text) > 500:
        raise ApiError('Keep the title under 90 and the message under 500 characters.')
    if audience != 'all' and not SECTION_RE.match(audience):
        raise ApiError('Unknown audience.')
    db = get_db()
    cur = db.execute('INSERT INTO notices (title, body, audience, important, date) VALUES (?, ?, ?, ?, ?)',
                     (title, text, audience, 1 if data.get('important') else 0, date.today().isoformat()))
    db.commit()
    return jsonify(notice=notice_to_dict(db.execute('SELECT * FROM notices WHERE id = ?', (cur.lastrowid,)).fetchone())), 201


@app.delete('/api/notices/<int:nid>')
@auth_required('teacher')
def delete_notice(nid):
    db = get_db()
    db.execute('DELETE FROM notices WHERE id = ?', (nid,))
    db.commit()
    return jsonify(ok=True)


@app.post('/api/notices/seen')
@auth_required('student')
def notices_seen():
    db = get_db()
    section = db.execute('SELECT section FROM students WHERE id = ?', (g.user_id,)).fetchone()['section']
    db.execute("INSERT OR IGNORE INTO notice_seen SELECT ?, id FROM notices WHERE audience IN ('all', ?)", (g.user_id, section))
    db.commit()
    return jsonify(ok=True)


# ---------------------------------------------------------------- student self-service
@app.put('/api/me/goal')
@auth_required('student')
def set_goal():
    goal = int_in(body().get('goal'), 1, 100, 'Goal')
    get_db().execute('UPDATE students SET goal = ? WHERE id = ?', (goal, g.user_id))
    get_db().commit()
    return jsonify(goal=goal)


@app.put('/api/me/password')
@auth_required('student')
def change_password():
    data = body()
    current, new = str(data.get('current', '')), str(data.get('next', ''))
    db = get_db()
    row = db.execute('SELECT password_hash FROM students WHERE id = ?', (g.user_id,)).fetchone()
    if not check_password_hash(row['password_hash'], current):
        raise ApiError('Current password is incorrect.')
    if len(new) < 6:
        raise ApiError('New password must be at least 6 characters.')
    if new == current:
        raise ApiError('New password must be different from the current one.')
    db.execute('UPDATE students SET password_hash = ? WHERE id = ?', (generate_password_hash(new), g.user_id))
    db.commit()
    return jsonify(ok=True)


# ---------------------------------------------------------------- frontend
@app.get('/')
def index():
    return app.send_static_file('index.html')


@app.get('/api/health')
def health():
    return jsonify(ok=True, model=MODEL_PATH.exists())


init_db()
if MODEL_PATH.exists():
    predictor()                # load the model at startup so the first sign-in isn't slow

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=int(os.environ.get('PORT', 5000)), debug=False)
