@echo off
rem Refreshes every dataset the site publishes, then rebuilds the site locally.
rem
rem   update-data.cmd        review the regen diff, then confirm before it is applied
rem   update-data.cmd /y     apply without asking
rem
rem 1. regen (dry-run)  fetch every source with an API key -> pipeline\out\diff-report.txt
rem 2. regen --apply    replays the SAME snapshots offline, so what lands is what you reviewed
rem 3. test, build (page + public artifacts), banner (og-banner*.png)
rem 4. curated check    plans.json / providers.json have no upstream API: lists what to re-verify by hand
rem
rem Nothing is committed or pushed; review `git status`, then commit with run-commit.cmd.
setlocal
cd /d "%~dp0"
if not exist pipeline\out mkdir pipeline\out

set "AUTO="
if /i "%~1"=="/y" set "AUTO=1"

rem The pipeline reads ANTHROPIC_API_KEY; fall back to the Turing key when only that is set.
if not defined ANTHROPIC_API_KEY if defined TUR_ANTHROPIC_API_KEY set "ANTHROPIC_API_KEY=%TUR_ANTHROPIC_API_KEY%"

if not exist node_modules\typescript (
  echo == npm ci
  call npm ci || goto :fail
)

echo == regen (dry-run)
call npm run regen > pipeline\out\regen.log 2>&1 || (type pipeline\out\regen.log & goto :fail)
findstr /v /c:"litellm-only" pipeline\out\regen.log
echo Full report: pipeline\out\diff-report.txt
echo Vendors "carried forward without live evidence" above had no key set: see the env var table in docs\references\pipeline.md.

if not defined AUTO (
  choice /c SN /m "Apply this diff to catalog\model-catalog.json"
  if errorlevel 2 (
    echo Not applied. Canonical catalog untouched.
    goto :curated
  )
)

echo == regen --apply (offline replay of the reviewed snapshots)
call npm run regen -- --offline --apply > pipeline\out\regen.log 2>&1 || (type pipeline\out\regen.log & goto :fail)
findstr /c:"APPLIED" pipeline\out\regen.log

echo == test
call npm test > pipeline\out\test.log 2>&1 || (type pipeline\out\test.log & goto :fail)
findstr /c:"pass " /c:"fail " pipeline\out\test.log

echo == build (page + public artifacts)
call npm run build || goto :fail

echo == banner
call npm run banner || goto :fail

:curated
echo == curated datasets
node scripts\check-curated.mjs

echo.
echo Done. Review with `git status`, commit with run-commit.cmd, push to publish.
git status --short
exit /b 0

:fail
echo.
echo update-data: FAILED - see the output above.
exit /b 1
