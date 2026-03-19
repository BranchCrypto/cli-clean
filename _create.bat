@echo off
set HTTPS_PROXY=http://127.0.0.1:7890
set HTTP_PROXY=http://127.0.0.1:7890

echo === Step 1: Create GitHub repo ===
gh repo create BranchCrypto/cli-clean --public --description "CLI-Clean - Local CLI cleanup tool for scanning, managing and deleting CLI tools and their associated files"
if errorlevel 1 goto err1

echo === Step 2: Git add ===
cd /d C:\Users\Administrator\Desktop\cli-clean
git add -A
if errorlevel 1 goto err2

echo === Step 3: Git commit ===
git commit -m "init: CLI-Clean v1.0.0"
if errorlevel 1 goto err3

echo === Step 4: Set remote and push ===
git remote set-url origin https://github.com/BranchCrypto/cli-clean.git
git push -u origin main --force
if errorlevel 1 goto err4

echo === Done! ===
pause
exit /b 0

:err1
echo ERROR: Failed to create repo
pause
exit /b 1
:err2
echo ERROR: Git add failed
pause
exit /b 1
:err3
echo ERROR: Git commit failed
pause
exit /b 1
:err4
echo ERROR: Git push failed
pause
exit /b 1
