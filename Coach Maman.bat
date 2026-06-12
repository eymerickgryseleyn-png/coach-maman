@echo off
chcp 65001 >nul
title Coach Maman
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
