from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def normalize_db_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    if url.startswith("postgresql://") and "+psycopg" not in url:
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


DATABASE_URL = normalize_db_url(
    os.getenv("DATABASE_URL", "sqlite:///./martin_forest_api.db")
)
AGENT_API_KEY = os.getenv("AGENT_API_KEY", "")
CORS_ORIGINS = [
    x.strip()
    for x in os.getenv(
        "CORS_ORIGINS",
        "https://martin-forest.surge.sh,https://artempilipeika-create.github.io",
    ).split(",")
    if x.strip()
]

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Order(Base):
    __tablename__ = "orders"

    order_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    order_name: Mapped[str] = mapped_column(String(240), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="queued", index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    lease_token: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.order_id"), index=True)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Customer(BaseModel):
    name: str = ""
    phone: str = ""
    email: str = ""


class ProjectInfo(BaseModel):
    type: str = ""
    notes: str = ""


class Material(BaseModel):
    article: str = ""
    name: str = ""
    qty: float | None = None
    unit: str = ""


class BazisInfo(BaseModel):
    expected_order_name: str = ""
    source_model: str = ""


class OrderCreate(BaseModel):
    order_id: str | None = Field(default=None, max_length=80)
    order_name: str = Field(min_length=1, max_length=240)
    customer: Customer = Field(default_factory=Customer)
    project: ProjectInfo = Field(default_factory=ProjectInfo)
    materials: list[Material] = Field(default_factory=list)
    bazis: BazisInfo = Field(default_factory=BazisInfo)
    external: dict[str, Any] = Field(default_factory=dict)


class PullRequest(BaseModel):
    limit: int = Field(default=20, ge=1, le=100)
    lease_minutes: int = Field(default=10, ge=1, le=60)


class AckRequest(BaseModel):
    order_ids: list[str]


class AgentEvent(BaseModel):
    order_id: str
    event_type: str
    status: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


app = FastAPI(title="Martin Forest Bridge API", version="1.0.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(engine)


def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def require_agent_key(x_agent_key: str | None = Header(default=None)) -> None:
    if not AGENT_API_KEY:
        raise HTTPException(status_code=503, detail="AGENT_API_KEY is not configured")
    if not x_agent_key or not secrets.compare_digest(x_agent_key, AGENT_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid agent key")


def make_order_id() -> str:
    return f"WEB-{utcnow():%Y%m%d}-{secrets.token_hex(4).upper()}"


def serialize_order(row: Order) -> dict[str, Any]:
    return {
        "order_id": row.order_id,
        "order_name": row.order_name,
        "status": row.status,
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
        **row.payload,
    }


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "martin-forest-bridge-api", "version": "1.0.1", "time": utcnow().isoformat()}


@app.post("/api/orders")
def create_order(req: OrderCreate, db: Session = Depends(db_session)) -> dict[str, Any]:
    order_id = (req.order_id or make_order_id()).strip()
    existing = db.get(Order, order_id)
    payload = req.model_dump(exclude={"order_id", "order_name"})

    if existing:
        if existing.order_name == req.order_name and existing.payload == payload:
            return {"created": False, "order": serialize_order(existing)}
        raise HTTPException(status_code=409, detail="order_id already exists with different content")

    row = Order(
        order_id=order_id,
        order_name=req.order_name.strip(),
        status="queued",
        payload=payload,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(row)

    # Force the parent order INSERT before inserting the FK-dependent event.
    # Without this explicit flush, SQLAlchemy can try to flush Event first
    # because there is no ORM relationship declared between the two models.
    db.flush()

    db.add(Event(order_id=order_id, event_type="created", payload={"source": "website"}))
    db.commit()
    db.refresh(row)
    return {"created": True, "order": serialize_order(row)}


@app.get("/api/orders/{order_id}")
def get_order(order_id: str, db: Session = Depends(db_session)) -> dict[str, Any]:
    row = db.get(Order, order_id)
    if not row:
        raise HTTPException(status_code=404, detail="Order not found")
    events = db.scalars(
        select(Event).where(Event.order_id == order_id).order_by(Event.id.asc())
    ).all()
    return {
        "order": serialize_order(row),
        "events": [
            {
                "id": e.id,
                "event_type": e.event_type,
                "payload": e.payload,
                "created_at": e.created_at.isoformat(),
            }
            for e in events
        ],
    }


@app.post("/api/agent/pull", dependencies=[Depends(require_agent_key)])
def agent_pull(req: PullRequest, db: Session = Depends(db_session)) -> dict[str, Any]:
    now = utcnow()

    expired = db.scalars(
        select(Order).where(
            Order.status == "leased",
            Order.lease_expires_at.is_not(None),
            Order.lease_expires_at < now,
        )
    ).all()
    for row in expired:
        row.status = "queued"
        row.lease_token = None
        row.lease_expires_at = None
        row.updated_at = now

    query = select(Order).where(Order.status == "queued").order_by(Order.created_at.asc()).limit(req.limit)
    if engine.dialect.name == "postgresql":
        query = query.with_for_update(skip_locked=True)

    rows = db.scalars(query).all()
    lease_token = secrets.token_urlsafe(24)
    expires = now + timedelta(minutes=req.lease_minutes)

    for row in rows:
        row.status = "leased"
        row.lease_token = lease_token
        row.lease_expires_at = expires
        row.updated_at = now

    db.commit()

    return {
        "lease_token": lease_token,
        "lease_expires_at": expires.isoformat(),
        "orders": [serialize_order(x) for x in rows],
    }


@app.post("/api/agent/ack", dependencies=[Depends(require_agent_key)])
def agent_ack(req: AckRequest, db: Session = Depends(db_session)) -> dict[str, Any]:
    acked: list[str] = []
    for order_id in req.order_ids:
        row = db.get(Order, order_id)
        if not row:
            continue
        row.status = "delivered_to_bridge"
        row.lease_token = None
        row.lease_expires_at = None
        row.updated_at = utcnow()
        db.add(Event(order_id=order_id, event_type="delivered_to_bridge", payload={}))
        acked.append(order_id)
    db.commit()
    return {"acked": acked}


@app.post("/api/agent/events", dependencies=[Depends(require_agent_key)])
def agent_event(req: AgentEvent, db: Session = Depends(db_session)) -> dict[str, Any]:
    row = db.get(Order, req.order_id)
    if not row:
        raise HTTPException(status_code=404, detail="Order not found")

    if req.status:
        row.status = req.status
        row.updated_at = utcnow()

    db.add(Event(
        order_id=req.order_id,
        event_type=req.event_type,
        payload=req.payload,
    ))
    db.commit()
    return {"ok": True, "order_id": req.order_id, "status": row.status}
