from functools import lru_cache
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from backend.app.core.config import get_settings


def _create_engine(database_url: str):
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    # Pool sized conservatively on purpose: this project's DATABASE_URL
    # points at ONE shared Supabase project used by every team laptop.
    # SQLAlchemy's default pool (size=5, max_overflow=10) lets a SINGLE
    # backend process hold up to 15 connections open at once - with 3
    # laptops each running their own backend against the same free-tier
    # project simultaneously (exactly the Day 7 integration test), that's
    # up to 45 connections competing for Supabase's connection limit,
    # which is a real, plausible cause of things "feeling slow" (or
    # outright connection failures) precisely when everyone tests together.
    # pool_recycle avoids handing out a connection Supabase already closed
    # server-side after sitting idle - pool_pre_ping catches that too, but
    # recycling proactively means fewer wasted round-trips discovering it.
    pool_kwargs = {} if database_url.startswith("sqlite") else {"pool_size": 3, "max_overflow": 2, "pool_recycle": 300}
    return create_engine(database_url, future=True, echo=False, pool_pre_ping=True, connect_args=connect_args, **pool_kwargs)


@lru_cache
def get_engine():
    return _create_engine(get_settings().database_url)


@lru_cache
def get_session_maker():
    return sessionmaker(autocommit=False, autoflush=False, bind=get_engine(), expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    session = get_session_maker()()
    try:
        yield session
    finally:
        session.close()
