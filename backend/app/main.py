from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import IMAGES_DIR
from app.database import init_db
from app.routers import boards, facets, images, search, swatches
from app.tagging import recover_stuck_images


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    recover_stuck_images()
    yield


app = FastAPI(title="GarmentClassifier API", lifespan=lifespan)

# The Electron renderer runs as a local web page (dev server or file://),
# so CORS is opened up for local development. Tighten this before shipping
# a packaged build that talks to anything beyond localhost.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/media", StaticFiles(directory=IMAGES_DIR), name="media")
app.include_router(boards.router)
app.include_router(images.router)
app.include_router(search.router)
app.include_router(facets.router)
app.include_router(swatches.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
