@echo off
setlocal EnableExtensions
chcp 65001 >nul
title OpenAdOps

if not defined PORT set "PORT=4173"
set "BASE_URL=http://127.0.0.1:%PORT%"
set "APP_URL=%BASE_URL%/#overview"
set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR="

echo.
echo OpenAdOps 简易启动
echo ==================

if defined OPENADOPS_HOME call :try_project "%OPENADOPS_HOME%"
if not defined PROJECT_DIR call :try_project "%SCRIPT_DIR%"
if not defined PROJECT_DIR call :try_project "%USERPROFILE%\Documents\Hypic\open-adops"
if not defined PROJECT_DIR goto :missing_project

if /I not "%PROJECT_DIR%\"=="%SCRIPT_DIR%" echo √ 已定位 OpenAdOps 仓库：%PROJECT_DIR%
cd /d "%PROJECT_DIR%" || goto :project_access_failed

call :is_healthy
if not errorlevel 1 (
  echo √ OpenAdOps 已在运行，正在打开工作台…
  start "" "%APP_URL%"
  exit /b 0
)

call :port_is_occupied
if not errorlevel 1 goto :port_occupied

where node >nul 2>&1 || goto :node_missing
where npm >nul 2>&1 || goto :node_missing
for /f "delims=" %%V in ('node -p "Number(process.versions.node.split('.')[0])"') do set "NODE_MAJOR=%%V"
if not defined NODE_MAJOR goto :node_missing
if %NODE_MAJOR% LSS 20 goto :node_old

set "CODEX_COMMAND=codex"
if defined CODEX_BIN set "CODEX_COMMAND=%CODEX_BIN%"
if not defined CODEX_BIN if exist "%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe" (
  set "CODEX_BIN=%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe"
  set "CODEX_COMMAND=%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe"
)
if not defined CODEX_BIN if exist "%APPDATA%\npm\codex.cmd" (
  set "CODEX_BIN=%APPDATA%\npm\codex.cmd"
  set "CODEX_COMMAND=%APPDATA%\npm\codex.cmd"
)
if not defined CODEX_BIN where codex >nul 2>&1 || goto :codex_missing

call "%CODEX_COMMAND%" login status >nul 2>&1
if errorlevel 1 (
  echo → 首次使用需要登录你自己的 ChatGPT / Codex 账号…
  call "%CODEX_COMMAND%" login || goto :codex_login_failed
)

echo √ 环境与 Codex 登录检查通过
echo → 正在启动本地服务…
echo.

start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command ^
  "$url='%APP_URL%'; for($i=0; $i -lt 60; $i++){ try { $r=Invoke-RestMethod -UseBasicParsing -TimeoutSec 1 '%BASE_URL%/api/health'; if($r.ok -eq $true -and $r.app -eq 'OpenAdOps'){ Start-Process $url; exit 0 } } catch {}; Start-Sleep -Milliseconds 250 }; exit 1"

call npm start
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" goto :server_failed
exit /b 0

:try_project
if exist "%~1\package.json" if exist "%~1\server.mjs" set "PROJECT_DIR=%~1"
exit /b 0

:is_healthy
powershell.exe -NoProfile -Command "try { $r=Invoke-RestMethod -UseBasicParsing -TimeoutSec 1 '%BASE_URL%/api/health'; if($r.ok -eq $true -and $r.app -eq 'OpenAdOps'){ exit 0 } } catch {}; exit 1" >nul 2>&1
exit /b %ERRORLEVEL%

:port_is_occupied
powershell.exe -NoProfile -Command "$listener=Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if($listener){exit 0}else{exit 1}" >nul 2>&1
exit /b %ERRORLEVEL%

:missing_project
call :fail "未找到完整的 OpenAdOps 文件夹。请下载并解压完整 Release，不要只复制启动器。"
exit /b 1
:project_access_failed
call :fail "无法访问 OpenAdOps 文件夹，请检查文件权限。"
exit /b 1
:port_occupied
call :fail "端口 %PORT% 已被其他程序占用，请先关闭占用程序。"
exit /b 1
:node_missing
call :fail "没有找到 Node.js/npm，请先安装 Node.js 20 或更高版本。"
exit /b 1
:node_old
call :fail "当前 Node.js 版本过低，需要 Node.js 20 或更高版本。"
exit /b 1
:codex_missing
call :fail "没有找到 Codex CLI。请先安装 Codex CLI，再运行 codex login。"
exit /b 1
:codex_login_failed
call :fail "Codex 登录未完成，请稍后重新运行 codex login。"
exit /b 1
:server_failed
call :fail "OpenAdOps 服务异常退出（退出码 %EXIT_CODE%）。"
exit /b 1

:fail
echo × %~1
echo.
pause
exit /b 1
