"""Train, compare and save the student-performance models.

Follows the project methodology:
  Phase 3  preprocessing   – duplicates, impossible values, missing values, encoding
  Phase 4  EDA             – histogram, boxplots, scatter plots, correlation heatmap
  Phase 5  feature work    – engineered features tested, irrelevant features removed
  Phase 6  model building  – Linear Regression, Random Forest, XGBoost
  Phase 7  evaluation      – MAE, MSE, RMSE, R² on a held-out test set + 5-fold CV

Outputs:
  models/best_model.joblib   the deployed model (used by the Flask API)
  models/metrics.json        everything the Model Lab page shows
  reports/figures/*.png      charts for the project report

Run:  python -m ml.train
"""
import json
import time
from datetime import datetime, timezone

import joblib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor

from ml.features import (DATA_CSV, FEATURE_COLUMNS, FEATURE_KEYS, FEATURES, FIGURES_DIR,
                         METRICS_PATH, MODEL_PATH, TARGET)

SEED = 42
VALID_RANGES = {
    'attendance_pct': (0, 100), 'assignment_score': (0, 100), 'internal_avg': (0, 100),
    'prev_sem_score': (0, 100), 'study_hours_week': (0, 30), 'sleep_hours': (0, 14),
    'commute_minutes': (0, 240), 'final_score': (0, 100),
}
MIN_CORRELATION = 0.15
PALETTE = ['#011C40', '#26658C', '#54ACBF', '#A7EBF2', '#DC586D', '#8EB69B']


# ---------------- Phase 3: preprocessing ----------------
def preprocess(raw):
    report = {'rowsRaw': int(len(raw))}
    df = raw.drop_duplicates().copy()
    report['duplicatesRemoved'] = int(len(raw) - len(df))

    out_of_range = pd.Series(False, index=df.index)
    for col, (lo, hi) in VALID_RANGES.items():
        out_of_range |= df[col].notna() & ~df[col].between(lo, hi)
    report['outliersRemoved'] = int(out_of_range.sum())
    df = df[~out_of_range].copy()

    report['missingFilled'] = int(df.isna().sum().sum())
    for col in df.columns:
        if df[col].isna().any():
            df[col] = df[col].fillna(df[col].median() if df[col].dtype.kind in 'fi' else df[col].mode()[0])

    df['extracurricular'] = (df['extracurricular'] == 'yes').astype(int)
    df['internet_access'] = (df['internet_access'] == 'yes').astype(int)
    df['gender_male'] = (df['gender'] == 'M').astype(int)
    df = df.drop(columns=['gender'])
    report['rowsClean'] = int(len(df))
    return df, report


# ---------------- Phase 4: EDA figures ----------------
def eda_figures(df):
    FIGURES_DIR.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update({'figure.dpi': 110, 'axes.spines.top': False, 'axes.spines.right': False})

    fig, ax = plt.subplots(figsize=(7, 4))
    ax.hist(df[TARGET], bins=25, color=PALETTE[1], edgecolor='white')
    ax.set(title='Distribution of final scores', xlabel='Final score', ylabel='Students')
    fig.tight_layout(); fig.savefig(FIGURES_DIR / 'histogram_final_score.png'); plt.close(fig)

    fig, axes = plt.subplots(1, len(FEATURE_COLUMNS), figsize=(12, 4))
    for ax, key in zip(axes, FEATURE_KEYS):
        col, label, _ = FEATURES[key]
        ax.boxplot(df[col], patch_artist=True, boxprops={'facecolor': PALETTE[2]}, medianprops={'color': PALETTE[0]})
        ax.set_title(label, fontsize=9); ax.set_xticks([])
    fig.suptitle('Feature spread (boxplots)'); fig.tight_layout(); fig.savefig(FIGURES_DIR / 'boxplots_features.png'); plt.close(fig)

    fig, axes = plt.subplots(1, 2, figsize=(11, 4))
    for ax, col, label in [(axes[0], 'attendance_pct', 'Attendance %'), (axes[1], 'study_hours_week', 'Study hours / week')]:
        ax.scatter(df[col], df[TARGET], s=10, alpha=.5, color=PALETTE[1])
        ax.set(xlabel=label, ylabel='Final score', title=f'{label} vs final score')
    fig.tight_layout(); fig.savefig(FIGURES_DIR / 'scatter_vs_final_score.png'); plt.close(fig)

    corr = df.drop(columns=['student_id']).corr()
    fig, ax = plt.subplots(figsize=(8, 6.5))
    im = ax.imshow(corr, cmap='RdBu_r', vmin=-1, vmax=1)
    ax.set_xticks(range(len(corr)), corr.columns, rotation=45, ha='right', fontsize=8)
    ax.set_yticks(range(len(corr)), corr.columns, fontsize=8)
    for i in range(len(corr)):
        for j in range(len(corr)):
            ax.text(j, i, f'{corr.iloc[i, j]:.2f}', ha='center', va='center', fontsize=6,
                    color='white' if abs(corr.iloc[i, j]) > .5 else 'black')
    fig.colorbar(im, fraction=.046); ax.set_title('Correlation heatmap')
    fig.tight_layout(); fig.savefig(FIGURES_DIR / 'correlation_heatmap.png'); plt.close(fig)
    return corr


# ---------------- Phase 5: feature engineering & selection ----------------
def select_features(df, corr):
    candidates = [c for c in df.columns if c not in ('student_id', TARGET)]
    target_corr = corr[TARGET].drop(TARGET)
    kept, dropped = [], []
    for col in candidates:
        r = float(target_corr[col])
        if abs(r) >= MIN_CORRELATION:
            kept.append({'name': col, 'r': round(r, 3)})
        else:
            dropped.append({'name': col, 'r': round(r, 3), 'reason': f'weak link to final score (|r| < {MIN_CORRELATION})'})

    # Engineered features: keep only if they improve cross-validated accuracy.
    engineered = {
        'engagement_index': (df['attendance_pct'] + df['assignment_score']) / 2,
        'study_efficiency': df['internal_avg'] / (df['study_hours_week'] + 1),
    }
    base_X, y = df[FEATURE_COLUMNS], df[TARGET]
    base_cv = cross_val_score(XGBRegressor(n_estimators=200, max_depth=4, learning_rate=.05, random_state=SEED),
                              base_X, y, cv=5, scoring='r2').mean()
    for name, series in engineered.items():
        cv = cross_val_score(XGBRegressor(n_estimators=200, max_depth=4, learning_rate=.05, random_state=SEED),
                             base_X.assign(**{name: series}), y, cv=5, scoring='r2').mean()
        gain = cv - base_cv
        entry = {'name': name, 'r': round(float(np.corrcoef(series, y)[0, 1]), 3), 'cvGain': round(float(gain), 4)}
        if gain > 0.005:
            kept.append(entry)
        else:
            entry['reason'] = f'engineered feature — no real accuracy gain (CV R² {gain:+.4f})'
            dropped.append(entry)

    kept_names = {k['name'] for k in kept}
    missing_app = [c for c in FEATURE_COLUMNS if c not in kept_names]
    if missing_app:
        print('Warning: app features below the correlation threshold:', missing_app)
    extra = [k['name'] for k in kept if k['name'] not in FEATURE_COLUMNS]
    if extra:
        print('Note: these also passed selection but the app does not collect them:', extra)
    return {'kept': kept, 'dropped': dropped, 'deployed': FEATURE_COLUMNS, 'threshold': MIN_CORRELATION}


# ---------------- Phase 6 & 7: train and evaluate ----------------
def build_models():
    return {
        'Linear Regression': ('Linear model', make_pipeline(StandardScaler(), LinearRegression())),
        'Random Forest': ('Bagging ensemble', RandomForestRegressor(n_estimators=300, min_samples_leaf=3, random_state=SEED, n_jobs=-1)),
        'XGBoost': ('Gradient boosting', XGBRegressor(n_estimators=400, learning_rate=.05, max_depth=4, subsample=.9,
                                                      colsample_bytree=.9, monotone_constraints='(1,1,1,1,1)', random_state=SEED)),
    }


def importance_of(model, X):
    if hasattr(model, 'feature_importances_'):
        values = np.asarray(model.feature_importances_, dtype=float)
    else:  # linear pipeline: standardised coefficients
        values = np.abs(model[-1].coef_)
    values = values / values.sum()
    return {FEATURES[k][1]: round(float(v), 4) for k, v in zip(FEATURE_KEYS, values)}


def main():
    raw = pd.read_csv(DATA_CSV)
    df, prep = preprocess(raw)
    corr = eda_figures(df)
    selection = select_features(df, corr)

    X, y = df[FEATURE_COLUMNS], df[TARGET]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=.2, random_state=SEED)

    results, fitted = [], {}
    for name, (kind, model) in build_models().items():
        cv_r2 = cross_val_score(model, X_train, y_train, cv=5, scoring='r2')
        start = time.perf_counter()
        model.fit(X_train, y_train)
        train_time = time.perf_counter() - start
        pred = np.clip(model.predict(X_test), 0, 100)
        mse = mean_squared_error(y_test, pred)
        results.append({
            'name': name, 'kind': kind,
            'mae': round(float(mean_absolute_error(y_test, pred)), 3),
            'mse': round(float(mse), 3),
            'rmse': round(float(np.sqrt(mse)), 3),
            'r2': round(float(r2_score(y_test, pred)), 4),
            'cvR2': round(float(cv_r2.mean()), 4),
            'cvR2Std': round(float(cv_r2.std()), 4),
            'trainTime': f'{train_time:.2f}s',
        })
        fitted[name] = model
        print(f'{name:18s} MAE {results[-1]["mae"]:.2f}  RMSE {results[-1]["rmse"]:.2f}  R² {results[-1]["r2"]:.3f}  (CV {cv_r2.mean():.3f})')

    best = max(results, key=lambda r: r['r2'])
    best_model = fitted[best['name']]
    importance = importance_of(best_model, X_train)

    # report figures for the evaluation phase
    fig, ax = plt.subplots(figsize=(7, 4))
    xs = np.arange(len(results))
    ax.bar(xs - .2, [r['mae'] for r in results], .4, label='MAE', color=PALETTE[2])
    ax.bar(xs + .2, [r['rmse'] for r in results], .4, label='RMSE', color=PALETTE[1])
    ax.set_xticks(xs, [r['name'] for r in results]); ax.set_title('Model error comparison (lower is better)'); ax.legend()
    fig.tight_layout(); fig.savefig(FIGURES_DIR / 'model_comparison.png'); plt.close(fig)

    fig, ax = plt.subplots(figsize=(5.5, 5))
    best_pred = np.clip(best_model.predict(X_test), 0, 100)
    ax.scatter(y_test, best_pred, s=12, alpha=.6, color=PALETTE[1])
    ax.plot([0, 100], [0, 100], '--', color=PALETTE[4])
    ax.set(xlabel='Actual final score', ylabel='Predicted', title=f'{best["name"]}: predicted vs actual', xlim=(20, 100), ylim=(20, 100))
    fig.tight_layout(); fig.savefig(FIGURES_DIR / 'predicted_vs_actual.png'); plt.close(fig)

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        'model': best_model, 'name': best['name'], 'features': FEATURE_KEYS, 'columns': FEATURE_COLUMNS,
        'means': {k: float(X_train[FEATURES[k][0]].mean()) for k in FEATURE_KEYS},
    }, MODEL_PATH)

    metrics = {
        'trainedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'dataset': {'name': 'Synthetic student performance (ml/generate_dataset.py)', 'synthetic': True,
                    'rows': prep['rowsClean'], 'split': '80 / 20 train-test split',
                    'trainRows': int(len(X_train)), 'testRows': int(len(X_test))},
        'preprocessing': prep,
        'selection': selection,
        'models': results,
        'best': best['name'],
        'importance': importance,
        'figures': sorted(p.name for p in FIGURES_DIR.glob('*.png')),
    }
    METRICS_PATH.write_text(json.dumps(metrics, indent=2))
    print(f'\nBest model: {best["name"]} (R² {best["r2"]:.3f}) -> {MODEL_PATH}')


if __name__ == '__main__':
    main()
