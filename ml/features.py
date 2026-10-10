"""Feature definitions shared by the training pipeline and the Flask API.

The app collects exactly these five inputs per student, so the deployed
model is trained on them (in this order).
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_CSV = ROOT / 'data' / 'students_dataset.csv'
MODEL_PATH = ROOT / 'models' / 'best_model.joblib'
METRICS_PATH = ROOT / 'models' / 'metrics.json'
FIGURES_DIR = ROOT / 'reports' / 'figures'

# app key -> (dataset column, label, valid range)
FEATURES = {
    'attendance': ('attendance_pct', 'Attendance', (0, 100)),
    'assignment': ('assignment_score', 'Assignment Score', (0, 100)),
    'internal': ('internal_avg', 'Internal Assessment', (0, 100)),
    'prevScore': ('prev_sem_score', 'Previous Sem Score', (0, 100)),
    'studyHours': ('study_hours_week', 'Study Hours / Week', (0, 30)),
}
FEATURE_KEYS = list(FEATURES)
FEATURE_COLUMNS = [FEATURES[k][0] for k in FEATURE_KEYS]
TARGET = 'final_score'

GRADE_BANDS = [(90, 'O'), (80, 'A+'), (70, 'A'), (60, 'B+'), (50, 'B'), (40, 'C')]


def grade_of(score):
    for cut, grade in GRADE_BANDS:
        if score >= cut:
            return grade
    return 'F'


def risk_of(score):
    return 'High' if score < 50 else 'Medium' if score < 65 else 'Low'
