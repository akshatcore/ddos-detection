from functools import lru_cache
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from backend.app.core.config import get_settings


def _create_engine(database_url: str):
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    return create_engine(database_url, future=True, echo=False, pool_pre_ping=True, connect_args=connect_args)


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
