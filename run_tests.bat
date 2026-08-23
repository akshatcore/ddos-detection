@echo off
setlocal
set PROJDIR=D:\ddos-detection
set LOG=%PROJDIR%\test_results.log

cd /d "%PROJDIR%"
echo ==== TEST RUN %DATE% %TIME% ==== > "%LOG%"

echo. >> "%LOG%"
echo === Activating venv === >> "%LOG%"
call "%PROJDIR%\venv\Scripts\activate.bat" >> "%LOG%" 2>&1

echo. >> "%LOG%"
echo === pip install -r requirements.txt (applying version fixes) === >> "%LOG%"
pip install -r requirements.txt >> "%LOG%" 2>&1
echo PIP_INSTALL_EXIT=%ERRORLEVEL% >> "%LOG%"

echo. >> "%LOG%"
echo === ruff check backend ml capture feature_extraction === >> "%LOG%"
ruff check backend ml capture feature_extraction >> "%LOG%" 2>&1
echo RUFF_EXIT=%ERRORLEVEL% >> "%LOG%"

echo. >> "%LOG%"
echo === pytest -q (DATABASE_URL=sqlite, JWT_SECRET_KEY=ci-secret) === >> "%LOG%"
set DATABASE_URL=sqlite:///./ci-test.db
set JWT_SECRET_KEY=ci-secret
pytest -q >> "%LOG%" 2>&1
echo PYTEST_EXIT=%ERRORLEVEL% >> "%LOG%"
set DATABASE_URL=
set JWT_SECRET_KEY=

echo. >> "%LOG%"
echo === ML sanity check (imports + model load) === >> "%LOG%"
python -c "import joblib, json; b=joblib.load('models/random_forest_v1.0.joblib'); print('model loaded OK:', type(b)); print(json.load(open('models/random_forest_v1.0_metadata.json')))" >> "%LOG%" 2>&1
echo ML_MODEL_LOAD_EXIT=%ERRORLEVEL% >> "%LOG%"

cd /d "%PROJDIR%"
echo. >> "%LOG%"
echo ==== DONE ==== >> "%LOG%"
echo TESTS_COMPLETE_MARKER >> "%LOG%"
