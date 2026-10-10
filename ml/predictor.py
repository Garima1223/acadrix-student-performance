"""Loads the trained model and answers prediction questions for the API."""
import math

import joblib
import numpy as np
import pandas as pd

from ml.features import FEATURE_COLUMNS, FEATURE_KEYS, FEATURES, MODEL_PATH, grade_of, risk_of

# Factors a student can still change this semester (previous semester is fixed).
ADJUSTABLE = ['attendance', 'assignment', 'internal', 'studyHours']


class Predictor:
    def __init__(self, path=MODEL_PATH):
        bundle = joblib.load(path)
        self.model = bundle['model']
        self.name = bundle['name']
        self.means = np.array([bundle['means'][k] for k in FEATURE_KEYS], dtype=float)

    def _scores(self, X):
        X = np.asarray(X, dtype=float).reshape(-1, len(FEATURE_KEYS))
        return np.clip(self.model.predict(pd.DataFrame(X, columns=FEATURE_COLUMNS)), 0, 100)

    @staticmethod
    def _row(features):
        return [float(features[k]) for k in FEATURE_KEYS]

    def predict(self, rows):
        """Score, grade, risk and per-factor impact for each feature dict.

        A factor's impact is how far the score moves when that factor is set
        back to the average student's value — positive means it is helping.
        """
        if not rows:
            return []
        X = np.array([self._row(r) for r in rows])
        y = self._scores(X)
        impacts = {}
        for j, key in enumerate(FEATURE_KEYS):
            X_avg = X.copy()
            X_avg[:, j] = self.means[j]
            impacts[key] = y - self._scores(X_avg)
        out = []
        for i in range(len(X)):
            score = round(float(y[i]), 1)
            out.append({
                'score': score, 'grade': grade_of(score), 'risk': risk_of(score),
                'contributions': {k: round(float(impacts[k][i]), 2) for k in FEATURE_KEYS},
            })
        return out

    def goal_plan(self, features, goal):
        """Ways to reach a target score: change one factor, or nudge all of them."""
        base = self._row(features)
        current = float(self._scores([base])[0])

        single = []
        for key in ADJUSTABLE:
            j = FEATURE_KEYS.index(key)
            hi = FEATURES[key][2][1]
            start = int(math.floor(base[j]))
            values = np.arange(start, hi + 1)
            X = np.tile(base, (len(values), 1))
            X[:, j] = values
            hits = np.nonzero(self._scores(X) >= goal)[0]
            reached = int(values[hits[0]]) if len(hits) else None
            single.append({'key': key, 'from': start, 'to': reached, 'ok': reached is not None})

        steps = np.linspace(0, 1, 201)
        grid = []
        for k in steps:
            row = list(base)
            for key in ADJUSTABLE:
                j = FEATURE_KEYS.index(key)
                row[j] = math.ceil(base[j] + k * (FEATURES[key][2][1] - base[j]))
            grid.append(row)
        grid = np.array(grid)
        scores = self._scores(grid)
        hits = np.nonzero(scores >= goal)[0]
        plan = None
        if len(hits):
            best = grid[hits[0]]
            plan = {key: int(best[FEATURE_KEYS.index(key)]) for key in ADJUSTABLE}
        return {'current': round(current, 1), 'goal': goal, 'single': single, 'plan': plan,
                'max': round(float(scores.max()), 1)}
