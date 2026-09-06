@echo off
REM Temporary helper written by Claude to run the test suite and capture output.
REM Safe to delete once you've read _test_output.txt.
cd /d "X:\Shared_AI\Procedural Space Game"
(
echo === node --check ===
node --check src\main.js
echo main.js exit=%%errorlevel%%
node --check src\save.js
echo save.js exit=%%errorlevel%%
) > _test_output.txt 2>&1

for %%F in (physics render cockpit economy nodes ships galaxy combat arcs) do (
  echo. >> _test_output.txt
  echo === %%F ===>> _test_output.txt
  node test\%%F.test.js >> _test_output.txt 2>&1
)
echo. >> _test_output.txt
echo === DONE ===>> _test_output.txt
