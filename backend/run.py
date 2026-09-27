"""Entry point for running the FastAPI backend locally.

Usage: python run.py
"""

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        # Without this, uvicorn watches the whole cwd recursively, which
        # includes .venv (huge, and touched by pip/model caches) and the
        # data dir (rewritten on every upload) - both trigger needless
        # full-process restarts mid-request.
        reload_dirs=["app"],
    )
