@echo off
rem Builds the site and serves it locally for testing.
rem
rem   run-site.cmd           build, serve on http://127.0.0.1:8765, open the browser
rem   run-site.cmd 9000      same, on another port
rem   run-site.cmd /nobuild  serve the current public\ as-is (skip the build)
rem
rem Build = npm run build (page TypeScript + public JSON artifacts). The catalog is
rem not regenerated; use update-data.cmd for that. Ctrl+C stops the server.
setlocal
cd /d "%~dp0"

set "PORT=8765"
set "BUILD=1"
:args
if "%~1"=="" goto :run
if /i "%~1"=="/nobuild" (set "BUILD=") else set "PORT=%~1"
shift
goto :args

:run
if defined BUILD (
  if not exist node_modules\typescript (
    echo == npm ci
    call npm ci || goto :fail
  )
  echo == build (page + public artifacts)
  call npm run build || goto :fail
)

rem serve.mjs opens the browser itself, only once it is listening on the port.
node scripts\serve.mjs %PORT% --open
exit /b %errorlevel%

:fail
echo.
echo run-site: FAILED - see the output above.
exit /b 1
