"""Generate a realistic, seeded student-performance dataset.

Each student has hidden "ability" and "motivation" traits that drive their
attendance, study habits and marks, so the features are correlated the way
real academic data is. The final score depends on the five app features,
with two real-world effects that a straight line can't capture:
  * study hours have diminishing returns
  * attendance below 75% carries an extra penalty

Some extra columns are added as candidates for feature selection
(sleep, commute, gender, extracurricular, internet), and the file is made
deliberately messy — missing values, duplicate rows and impossible values —
so the preprocessing phase has real work to do.

Run:  python -m ml.generate_dataset
"""
import numpy as np
import pandas as pd

from ml.features import DATA_CSV

N_STUDENTS = 1000
SEED = 42


def generate(n=N_STUDENTS, seed=SEED):
    rng = np.random.default_rng(seed)
    ability = rng.normal(0, 1, n)
    motivation = rng.normal(0, 1, n)

    attendance = np.clip(80 + 9 * motivation + 4 * ability + rng.normal(0, 6, n), 30, 100)
    study = np.clip(10 + 4 * motivation + 1.5 * ability + rng.normal(0, 3, n), 0, 30)
    prev = np.clip(68 + 11 * ability + rng.normal(0, 7, n), 20, 100)
    assignment = np.clip(70 + 8 * motivation + 7 * ability + rng.normal(0, 8, n), 10, 100)
    internal = np.clip(66 + 12 * ability + 3 * motivation + 0.4 * (study - 10) + rng.normal(0, 7, n), 10, 100)

    sleep = np.clip(rng.normal(7, 1, n), 4, 10)
    commute = rng.integers(5, 91, n)
    gender = rng.choice(['F', 'M'], n)
    extracurricular = rng.choice(['yes', 'no'], n, p=[.45, .55])
    internet = rng.choice(['yes', 'no'], n, p=[.85, .15])

    study_effect = 9 * np.log1p(study) / np.log1p(30)              # 0..9 points, diminishing
    attendance_penalty = np.where(attendance < 75, (75 - attendance) * 0.25, 0)
    final = (0.17 * attendance + 0.22 * assignment + 0.32 * internal + 0.18 * prev
             + study_effect - attendance_penalty
             + 0.8 * (sleep - 7) + 1.0 * (internet == 'yes')
             + rng.normal(0, 3.5, n) - 1)
    final = np.clip(final, 0, 100)

    df = pd.DataFrame({
        'student_id': [f'S{10000 + i}' for i in range(n)],
        'gender': gender,
        'attendance_pct': attendance.round(1),
        'assignment_score': assignment.round(0),
        'internal_avg': internal.round(1),
        'prev_sem_score': prev.round(1),
        'study_hours_week': study.round(1),
        'sleep_hours': sleep.round(1),
        'commute_minutes': commute,
        'extracurricular': extracurricular,
        'internet_access': internet,
        'final_score': final.round(1),
    })

    # --- make it messy, like real exported data ---
    for col in ['attendance_pct', 'study_hours_week', 'assignment_score', 'sleep_hours']:
        idx = rng.choice(n, size=int(n * 0.02), replace=False)
        df.loc[idx, col] = np.nan
    bad = rng.choice(n, size=8, replace=False)
    df.loc[bad[:5], 'study_hours_week'] = rng.integers(55, 90, 5)      # impossible weekly hours
    df.loc[bad[5:], 'attendance_pct'] = rng.integers(130, 160, 3)      # >100% attendance
    dupes = df.sample(15, random_state=seed)
    df = pd.concat([df, dupes]).sample(frac=1, random_state=seed).reset_index(drop=True)
    return df


if __name__ == '__main__':
    DATA_CSV.parent.mkdir(parents=True, exist_ok=True)
    data = generate()
    data.to_csv(DATA_CSV, index=False)
    print(f'Wrote {len(data)} rows to {DATA_CSV}')
