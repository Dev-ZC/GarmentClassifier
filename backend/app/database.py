from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import DATABASE_URL

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # Import models so they're registered on Base before creating tables.
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _migrate_new_columns()
    _migrate_legacy_positions()


def _migrate_new_columns() -> None:
    """create_all only adds whole tables, so columns introduced on an
    existing table (here: placement note/info_open) get added with plain
    ALTER TABLE after checking what's already there."""
    from sqlalchemy import text

    new_columns = {
        "board_images": {
            "note": "VARCHAR DEFAULT '' NOT NULL",
            "info_open": "BOOLEAN DEFAULT 0 NOT NULL",
        },
        "images": {
            "parent_id": "VARCHAR",
            "content_hash": "VARCHAR",
            "is_swatch": "BOOLEAN DEFAULT 0 NOT NULL",
            "suitable_for": "JSON",
        },
        "board_elements": {
            "font_size": "FLOAT DEFAULT 32.0 NOT NULL",
        },
        "board_notes": {
            "color": "VARCHAR DEFAULT 'yellow' NOT NULL",
            "title": "VARCHAR DEFAULT '' NOT NULL",
            "mode": "VARCHAR DEFAULT 'text' NOT NULL",
            "checklist": "JSON",
            "tags": "JSON",
            "swatch": "VARCHAR DEFAULT '' NOT NULL",
            "pinned": "BOOLEAN DEFAULT 0 NOT NULL",
            "collapsed": "BOOLEAN DEFAULT 0 NOT NULL",
            "width": "FLOAT DEFAULT 240.0 NOT NULL",
            "height": "FLOAT",
        },
    }
    # JSON-list columns need existing rows backfilled from NULL to "[]" -
    # ALTER TABLE ADD COLUMN only applies a DEFAULT to new rows, and a
    # bare NULL would fail the API schema's `list[...]` validation on read.
    json_list_columns = {"checklist", "tags", "suitable_for"}
    with engine.begin() as conn:
        for table, columns in new_columns.items():
            existing = {
                row[1] for row in conn.execute(text(f"PRAGMA table_info({table})"))
            }
            for name, ddl in columns.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                    if name in json_list_columns:
                        conn.execute(
                            text(f"UPDATE {table} SET {name} = '[]' WHERE {name} IS NULL")
                        )


def _migrate_legacy_positions() -> None:
    """Pre-boards installs stored the canvas position on the image itself.
    If such images exist but no placements were ever created, put them all
    on a fresh "Untitled Board" at their saved positions so nothing looks
    lost after upgrading."""
    from app.models import Board, BoardImage, Image

    db = SessionLocal()
    try:
        if db.query(BoardImage).first() is not None:
            return
        images = db.query(Image).all()
        if not images:
            return
        board = Board(name="Untitled Board")
        db.add(board)
        db.flush()
        for image in images:
            db.add(BoardImage(board_id=board.id, image_id=image.id, x=image.x, y=image.y))
        db.commit()
    finally:
        db.close()
