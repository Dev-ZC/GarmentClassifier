#!/usr/bin/env bash
# Convenience script to set up a venv (if needed) and run the API with
# auto-reload. Invoked by `npm run dev` in ../frontend, or directly.
set -e
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  python3 -m venv .venv
fi

source .venv/bin/activate
pip install -q -r requirements.txt
python run.py
