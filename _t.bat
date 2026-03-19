@echo off
set HTTPS_PROXY=http://127.0.0.1:7890
set HTTP_PROXY=http://127.0.0.1:7890

cd /d C:\Users\Administrator\Desktop\cli-clean
git add -A
git commit -m "chore: cleanup"
git push origin main
