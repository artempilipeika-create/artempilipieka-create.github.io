from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import create_engine, String, Integer, Float, Boolean, DateTime, Text, ForeignKey, select, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session, sessionmaker

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
STORAGE = ROOT / "storage"
ORDER_FILES = STORAGE / "orders"
STORAGE.mkdir(exist_ok=True)
ORDER_FILES.mkdir(parents=True, exist_ok=True)

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{(STORAGE / 'martin_forest.db').as_posix()}")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(engine, expire_on_commit=False, class_=Session)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(80), default="")
    password_hash: Mapped[str] = mapped_column(String(500))
    role: Mapped[str] = mapped_column(String(32), default="customer")
    permissions_json: Mapped[str] = mapped_column(Text, default="[]")
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    block_reason: Mapped[str] = mapped_column(Text, default="")
    discount_percent: Mapped[float] = mapped_column(Float, default=0.0)
    subscription_3d_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class SessionToken(Base):
    __tablename__ = "sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_number: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(255), default="Без названия")
    status: Mapped[str] = mapped_column(String(40), default="draft")
    payment_status: Mapped[str] = mapped_column(String(40), default="unpaid")
    preliminary_total: Mapped[float] = mapped_column(Float, default=0.0)
    final_total: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    paid_amount: Mapped[float] = mapped_column(Float, default=0.0)
    discount_percent: Mapped[float] = mapped_column(Float, default=0.0)
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    version: Mapped[int] = mapped_column(Integer, default=1)
    client_comment: Mapped[str] = mapped_column(Text, default="")
    internal_comment: Mapped[str] = mapped_column(Text, default="")
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(120))
    target_type: Mapped[str] = mapped_column(String(80), default="")
    target_id: Mapped[str] = mapped_column(String(80), default="")
    details_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ImportTemplate(Base):
    __tablename__ = "import_templates"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    fingerprint: Mapped[str] = mapped_column(String(120), index=True)
    mapping_json: Mapped[str] = mapped_column(Text, default="{}")
    status: Mapped[str] = mapped_column(String(32), default="new")
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ImportTemplateRevision(Base):
    __tablename__ = "import_template_revisions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("import_templates.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    mapping_json: Mapped[str] = mapped_column(Text, default="{}")
    fingerprint: Mapped[str] = mapped_column(String(120), default="")
    name: Mapped[str] = mapped_column(String(160), default="")
    actor_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


Base.metadata.create_all(engine)

ORDER_STATUSES = {"draft", "manager_processing", "submitted", "review", "approved", "in_work", "ready", "issued", "cancelled"}
PAYMENT_STATUSES = {"unpaid", "partial", "paid"}
STAFF_ROLES = {"admin", "manager", "production", "accounting", "viewer"}
DEFAULT_PERMISSIONS = {
    "manager": ["orders.read", "orders.status", "orders.process", "payments.write", "customers.read", "files.read", "templates.manage"],
    "production": ["orders.read", "orders.production", "files.read"],
    "accounting": ["orders.read", "payments.write", "customers.read"],
    "viewer": ["orders.read", "customers.read"],
    "admin": ["*"],
}


def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def hash_password(password: str, salt: Optional[bytes] = None) -> str:
    if salt is None:
        salt = secrets.token_bytes(16)
    rounds = 260_000
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, rounds)
    return f"pbkdf2_sha256${rounds}${salt.hex()}${dk.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        alg, rounds_s, salt_hex, digest_hex = encoded.split("$")
        if alg != "pbkdf2_sha256":
            return False
        test = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(rounds_s)).hex()
        return hmac.compare_digest(test, digest_hex)
    except Exception:
        return False


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue_session(db: Session, user_id: int) -> str:
    token = secrets.token_urlsafe(36)
    db.add(SessionToken(user_id=user_id, token_hash=token_digest(token), expires_at=utcnow() + timedelta(days=30)))
    db.commit()
    return token


def audit(db: Session, actor: Optional[int], action: str, target_type: str = "", target_id: str = "", details=None):
    db.add(AuditLog(actor_user_id=actor, action=action, target_type=target_type, target_id=str(target_id), details_json=json.dumps(details or {}, ensure_ascii=False)))
    db.commit()


def public_user(u: User):
    until = ensure_aware(u.subscription_3d_until)
    return {
        "id": u.id,
        "name": u.name,
        "email": u.email,
        "phone": u.phone,
        "role": u.role,
        "permissions": json.loads(u.permissions_json or "[]"),
        "isBlocked": u.is_blocked,
        "blockReason": u.block_reason,
        "discountPercent": u.discount_percent,
        "subscription3dUntil": until.isoformat() if until else None,
        "subscription3dActive": bool((u.role == "admin" or (until and until > utcnow())) and not u.is_blocked),
        "createdAt": ensure_aware(u.created_at).isoformat(),
    }


def current_user(request: Request, db: Session = Depends(db_session)) -> User:
    token = request.cookies.get("mf_session")
    if not token:
        raise HTTPException(401, "Требуется вход")
    st = db.scalar(select(SessionToken).where(SessionToken.token_hash == token_digest(token)))
    if not st or ensure_aware(st.expires_at) <= utcnow():
        raise HTTPException(401, "Сессия истекла")
    user = db.get(User, st.user_id)
    if not user:
        raise HTTPException(401, "Пользователь не найден")
    return user


def require_staff(user: User = Depends(current_user)) -> User:
    if user.role not in STAFF_ROLES:
        raise HTTPException(403, "Нет доступа")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Только администратор")
    return user


def permissions_of(user: User) -> set[str]:
    try:
        return set(json.loads(user.permissions_json or "[]"))
    except Exception:
        return set()


def has_permission(user: User, permission: str) -> bool:
    perms = permissions_of(user)
    return user.role == "admin" or "*" in perms or permission in perms


def require_template_manager(user: User = Depends(current_user)) -> User:
    if user.role not in STAFF_ROLES or not has_permission(user, "templates.manage"):
        raise HTTPException(403, "Нет права управлять шаблонами импорта")
    return user


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    phone: str = Field(default="", max_length=80)
    password: str = Field(min_length=8, max_length=200)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class SourceFileIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: str = Field(default="application/octet-stream", max_length=160)
    base64: str = Field(min_length=1)


class OrderIn(BaseModel):
    title: str = "Без названия"
    payload: dict
    oblx: str = ""
    preliminaryTotal: float = 0
    status: str = "submitted"
    sourceFile: Optional[SourceFileIn] = None


class ImportTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    fingerprint: str = Field(min_length=1, max_length=120)
    mapping: dict
    status: str = "new"


class ImportTemplatePatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    fingerprint: Optional[str] = Field(default=None, min_length=1, max_length=120)
    mapping: Optional[dict] = None
    status: Optional[str] = None
    isActive: Optional[bool] = None


class OrderAdminPatch(BaseModel):
    status: Optional[str] = None
    paymentStatus: Optional[str] = None
    finalTotal: Optional[float] = None
    paidAmount: Optional[float] = None
    internalComment: Optional[str] = None


class UserAdminPatch(BaseModel):
    isBlocked: Optional[bool] = None
    blockReason: Optional[str] = None
    discountPercent: Optional[float] = Field(default=None, ge=0, le=100)
    subscription3dUntil: Optional[datetime] = None
    role: Optional[str] = None
    permissions: Optional[list[str]] = None


class StaffCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str = ""
    password: str = Field(min_length=8)
    role: str = "manager"
    permissions: Optional[list[str]] = None


app = FastAPI(title="Martin Forest API", version="0.10")


@app.on_event("startup")
def bootstrap_admin():
    with SessionLocal() as db:
        email = os.getenv("ADMIN_EMAIL", "admin@martinforest.by").lower().strip()
        existing = db.scalar(select(User).where(User.email == email))
        if not existing:
            password = os.getenv("ADMIN_PASSWORD", "MartinForest2026!")
            u = User(name="Главный администратор", email=email, phone="", password_hash=hash_password(password), role="admin", permissions_json='["*"]')
            db.add(u)
            db.commit()
            print(f"[Martin Forest] Создан локальный админ: {email} / {password}")


@app.get("/api/health")
def health():
    return {"ok": True, "time": utcnow().isoformat()}


@app.post("/api/auth/register")
def register(data: RegisterIn, response: Response, db: Session = Depends(db_session)):
    email = data.email.lower().strip()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Такой email уже зарегистрирован")
    u = User(name=data.name.strip(), email=email, phone=data.phone.strip(), password_hash=hash_password(data.password), role="customer", permissions_json="[]")
    db.add(u); db.commit(); db.refresh(u)
    token = issue_session(db, u.id)
    response.set_cookie("mf_session", token, httponly=True, samesite="lax", secure=False, max_age=30*24*3600)
    audit(db, u.id, "auth.register", "user", u.id)
    return {"ok": True, "user": public_user(u)}


@app.post("/api/auth/login")
def login(data: LoginIn, response: Response, db: Session = Depends(db_session)):
    u = db.scalar(select(User).where(User.email == data.email.lower().strip()))
    if not u or not verify_password(data.password, u.password_hash):
        raise HTTPException(401, "Неверный email или пароль")
    token = issue_session(db, u.id)
    response.set_cookie("mf_session", token, httponly=True, samesite="lax", secure=False, max_age=30*24*3600)
    audit(db, u.id, "auth.login", "user", u.id)
    return {"ok": True, "user": public_user(u)}


@app.post("/api/auth/logout")
def logout(request: Request, response: Response, db: Session = Depends(db_session)):
    token = request.cookies.get("mf_session")
    if token:
        st = db.scalar(select(SessionToken).where(SessionToken.token_hash == token_digest(token)))
        if st:
            db.delete(st); db.commit()
    response.delete_cookie("mf_session")
    return {"ok": True}


@app.get("/api/me")
def me(user: User = Depends(current_user)):
    return {"ok": True, "user": public_user(user)}


@app.get("/api/3d/access")
def access_3d(user: User = Depends(current_user)):
    until = ensure_aware(user.subscription_3d_until)
    return {"ok": True, "allowed": bool((user.role == "admin" or (until and until > utcnow())) and not user.is_blocked), "until": until.isoformat() if until else None, "blocked": user.is_blocked, "unlimited": user.role == "admin"}


def safe_filename(name: str) -> str:
    base = Path(name or "file").name
    base = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', '_', base).strip(' .')
    return base[:180] or "file"


def order_dir(order_number: str) -> Path:
    return ORDER_FILES / safe_filename(order_number)


def find_order_file(o: Order, kind: str) -> Optional[Path]:
    folder = order_dir(o.order_number)
    if kind == "oblx":
        modern = folder / f"{o.order_number}.oblx"
        legacy = ORDER_FILES / f"{o.order_number}.oblx"
        return modern if modern.exists() else (legacy if legacy.exists() else None)
    if kind == "source":
        source = folder / "source"
        files = sorted([x for x in source.iterdir() if x.is_file()]) if source.exists() else []
        return files[0] if files else None
    return None


def save_source_file(folder: Path, source: SourceFileIn) -> Path:
    raw_name = safe_filename(source.name)
    ext = Path(raw_name).suffix.lower()
    if ext not in {".xlsx", ".xls", ".csv", ".oblx", ".pdf"}:
        raise HTTPException(400, "Недопустимый тип исходного файла")
    try:
        content = base64.b64decode(source.base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "Исходный файл повреждён")
    if len(content) > 12 * 1024 * 1024:
        raise HTTPException(413, "Исходный файл больше 12 МБ")
    source_dir = folder / "source"
    source_dir.mkdir(parents=True, exist_ok=True)
    path = source_dir / raw_name
    path.write_bytes(content)
    return path


def serialize_template(t: ImportTemplate, user: Optional[User] = None):
    return {
        "id": t.id,
        "userId": t.user_id,
        "customerName": user.name if user else None,
        "customerEmail": user.email if user else None,
        "name": t.name,
        "fingerprint": t.fingerprint,
        "mapping": json.loads(t.mapping_json or "{}"),
        "status": t.status,
        "version": t.version,
        "isActive": t.is_active,
        "createdAt": ensure_aware(t.created_at).isoformat(),
        "updatedAt": ensure_aware(t.updated_at).isoformat(),
    }


def next_order_number(db: Session) -> str:
    year = utcnow().year
    count = db.scalar(select(func.count(Order.id)).where(Order.created_at >= datetime(year,1,1,tzinfo=timezone.utc))) or 0
    return f"MF-{year}-{count+1:06d}"


def serialize_order(o: Order, user: Optional[User] = None):
    total = o.final_total if o.final_total is not None else o.preliminary_total
    balance = max(0.0, total - o.paid_amount)
    return {
        "id": o.id,
        "orderNumber": o.order_number,
        "userId": o.user_id,
        "customerName": user.name if user else None,
        "customerPhone": user.phone if user else None,
        "title": o.title,
        "status": o.status,
        "paymentStatus": o.payment_status,
        "preliminaryTotal": o.preliminary_total,
        "finalTotal": o.final_total,
        "paidAmount": o.paid_amount,
        "balance": balance,
        "discountPercent": o.discount_percent,
        "version": o.version,
        "internalComment": o.internal_comment,
        "createdAt": ensure_aware(o.created_at).isoformat(),
        "updatedAt": ensure_aware(o.updated_at).isoformat(),
        "completedAt": ensure_aware(o.completed_at).isoformat() if o.completed_at else None,
        "hasOblx": find_order_file(o, "oblx") is not None,
        "hasSourceFile": find_order_file(o, "source") is not None,
    }


@app.post("/api/orders")
def create_order(data: OrderIn, user: User = Depends(current_user), db: Session = Depends(db_session)):
    if user.is_blocked:
        raise HTTPException(403, "Аккаунт заблокирован. Создание заказов недоступно")
    if data.status not in {"draft", "submitted", "manager_processing"}:
        raise HTTPException(400, "Недопустимый статус")
    base = max(0.0, data.preliminaryTotal)
    discounted = base * (1 - user.discount_percent/100)
    number = next_order_number(db)
    o = Order(order_number=number, user_id=user.id, title=data.title[:255] or "Без названия", status=data.status,
              payment_status="unpaid", preliminary_total=round(discounted,2), discount_percent=user.discount_percent,
              payload_json=json.dumps(data.payload, ensure_ascii=False), client_comment=str(data.payload.get("orderComment", "")))
    db.add(o); db.commit(); db.refresh(o)
    folder = order_dir(number)
    folder.mkdir(parents=True, exist_ok=True)
    if data.oblx:
        (folder / f"{number}.oblx").write_text(data.oblx, encoding="utf-8-sig")
    (folder / f"{number}.json").write_text(json.dumps(data.payload, ensure_ascii=False, indent=2), encoding="utf-8")
    source_name = None
    if data.sourceFile:
        source_name = save_source_file(folder, data.sourceFile).name
    action = "order.handoff_manager" if data.status == "manager_processing" else "order.create"
    audit(db, user.id, action, "order", o.id, {"number": number, "status": data.status, "sourceFile": source_name})
    return {"ok": True, "order": serialize_order(o), "orderNumber": number}


@app.get("/api/orders")
def my_orders(user: User = Depends(current_user), db: Session = Depends(db_session)):
    cutoff = utcnow() - timedelta(days=30)
    rows = db.scalars(select(Order).where(Order.user_id == user.id).order_by(Order.created_at.desc())).all()
    visible = []
    for o in rows:
        completed = ensure_aware(o.completed_at)
        if completed and completed < cutoff:
            continue
        visible.append(serialize_order(o))
    return {"ok": True, "orders": visible}


@app.get("/api/orders/{order_id}")
def order_detail(order_id: int, user: User = Depends(current_user), db: Session = Depends(db_session)):
    o = db.get(Order, order_id)
    if not o:
        raise HTTPException(404, "Заказ не найден")
    if o.user_id != user.id and user.role not in STAFF_ROLES:
        raise HTTPException(403, "Нет доступа")
    data = serialize_order(o, db.get(User,o.user_id) if user.role in STAFF_ROLES else None)
    data["payload"] = json.loads(o.payload_json or "{}")
    return {"ok": True, "order": data}


@app.get("/api/orders/{order_id}/oblx")
def download_oblx(order_id: int, user: User = Depends(current_user), db: Session = Depends(db_session)):
    o = db.get(Order, order_id)
    if not o:
        raise HTTPException(404, "Заказ не найден")
    if o.user_id != user.id and user.role not in STAFF_ROLES:
        raise HTTPException(403, "Нет доступа")
    path = find_order_file(o, "oblx")
    if not path:
        raise HTTPException(404, "OBLX ещё не создан")
    return FileResponse(path, media_type="application/xml", filename=path.name)


@app.get("/api/orders/{order_id}/source")
def download_source(order_id: int, user: User = Depends(current_user), db: Session = Depends(db_session)):
    o = db.get(Order, order_id)
    if not o:
        raise HTTPException(404, "Заказ не найден")
    if o.user_id != user.id and user.role not in STAFF_ROLES:
        raise HTTPException(403, "Нет доступа")
    if user.role in STAFF_ROLES and user.role != "admin" and not has_permission(user, "files.read"):
        raise HTTPException(403, "Нет права читать исходные файлы")
    path = find_order_file(o, "source")
    if not path:
        raise HTTPException(404, "Исходный файл не приложен")
    return FileResponse(path, filename=path.name)


@app.get("/api/import-templates")
def my_import_templates(user: User = Depends(current_user), db: Session = Depends(db_session)):
    rows = db.scalars(select(ImportTemplate).where(ImportTemplate.user_id == user.id).order_by(ImportTemplate.updated_at.desc())).all()
    return {"ok": True, "templates": [serialize_template(x) for x in rows]}


@app.post("/api/import-templates")
def create_import_template(data: ImportTemplateCreate, user: User = Depends(current_user), db: Session = Depends(db_session)):
    if user.is_blocked:
        raise HTTPException(403, "Аккаунт заблокирован")
    status = data.status if user.role in STAFF_ROLES and has_permission(user, "templates.manage") else "new"
    if status not in {"new", "verified", "working"}:
        raise HTTPException(400, "Недопустимый статус шаблона")
    t = ImportTemplate(user_id=user.id, name=data.name.strip(), fingerprint=data.fingerprint.strip(), mapping_json=json.dumps(data.mapping, ensure_ascii=False), status=status, version=1, is_active=True)
    db.add(t); db.commit(); db.refresh(t)
    db.add(ImportTemplateRevision(template_id=t.id, version=1, mapping_json=t.mapping_json, fingerprint=t.fingerprint, name=t.name, actor_user_id=user.id)); db.commit()
    audit(db, user.id, "template.create", "import_template", t.id, {"name": t.name, "fingerprint": t.fingerprint})
    return {"ok": True, "template": serialize_template(t)}


def template_access(t: ImportTemplate, user: User, write: bool = False):
    if t.user_id == user.id:
        return
    if user.role in STAFF_ROLES and has_permission(user, "templates.manage"):
        return
    raise HTTPException(403, "Нет доступа к шаблону")


@app.patch("/api/import-templates/{template_id}")
def patch_import_template(template_id: int, data: ImportTemplatePatch, user: User = Depends(current_user), db: Session = Depends(db_session)):
    t = db.get(ImportTemplate, template_id)
    if not t:
        raise HTTPException(404, "Шаблон не найден")
    template_access(t, user, True)
    is_staff_manager = user.role in STAFF_ROLES and has_permission(user, "templates.manage")
    changes = {}
    mapping_changed = False
    if data.name is not None and data.name.strip() != t.name:
        t.name = data.name.strip(); changes["name"] = t.name
    if data.fingerprint is not None and data.fingerprint.strip() != t.fingerprint:
        t.fingerprint = data.fingerprint.strip(); changes["fingerprint"] = t.fingerprint; mapping_changed = True
    if data.mapping is not None:
        new_json = json.dumps(data.mapping, ensure_ascii=False, sort_keys=True)
        old_json = json.dumps(json.loads(t.mapping_json or "{}"), ensure_ascii=False, sort_keys=True)
        if new_json != old_json:
            t.mapping_json = json.dumps(data.mapping, ensure_ascii=False); changes["mapping"] = True; mapping_changed = True
    if data.status is not None:
        if not is_staff_manager:
            raise HTTPException(403, "Статус шаблона меняет менеджер")
        if data.status not in {"new", "verified", "working"}:
            raise HTTPException(400, "Недопустимый статус шаблона")
        t.status = data.status; changes["status"] = data.status
    if data.isActive is not None:
        t.is_active = data.isActive; changes["isActive"] = data.isActive
    if mapping_changed:
        t.version += 1
        db.add(ImportTemplateRevision(template_id=t.id, version=t.version, mapping_json=t.mapping_json, fingerprint=t.fingerprint, name=t.name, actor_user_id=user.id))
        changes["version"] = t.version
        if not is_staff_manager:
            t.status = "new"
    t.updated_at = utcnow(); db.commit()
    audit(db, user.id, "template.update", "import_template", t.id, changes)
    return {"ok": True, "template": serialize_template(t, db.get(User, t.user_id) if is_staff_manager else None)}


@app.get("/api/import-templates/{template_id}/history")
def import_template_history(template_id: int, user: User = Depends(current_user), db: Session = Depends(db_session)):
    t = db.get(ImportTemplate, template_id)
    if not t:
        raise HTTPException(404, "Шаблон не найден")
    template_access(t, user)
    rows = db.scalars(select(ImportTemplateRevision).where(ImportTemplateRevision.template_id == t.id).order_by(ImportTemplateRevision.version.desc())).all()
    return {"ok": True, "versions": [{"version": x.version, "name": x.name, "fingerprint": x.fingerprint, "mapping": json.loads(x.mapping_json or "{}"), "actorUserId": x.actor_user_id, "createdAt": ensure_aware(x.created_at).isoformat()} for x in rows]}


@app.get("/api/admin/import-templates")
def admin_import_templates(staff: User = Depends(require_template_manager), db: Session = Depends(db_session)):
    rows = db.scalars(select(ImportTemplate).order_by(ImportTemplate.updated_at.desc())).all()
    return {"ok": True, "templates": [serialize_template(x, db.get(User, x.user_id)) for x in rows]}


@app.post("/api/admin/import-templates/{template_id}/rollback/{version}")
def rollback_import_template(template_id: int, version: int, staff: User = Depends(require_template_manager), db: Session = Depends(db_session)):
    t = db.get(ImportTemplate, template_id)
    if not t:
        raise HTTPException(404, "Шаблон не найден")
    rev = db.scalar(select(ImportTemplateRevision).where(ImportTemplateRevision.template_id == t.id, ImportTemplateRevision.version == version))
    if not rev:
        raise HTTPException(404, "Версия шаблона не найдена")
    t.version += 1
    t.name = rev.name or t.name
    t.fingerprint = rev.fingerprint or t.fingerprint
    t.mapping_json = rev.mapping_json
    t.updated_at = utcnow()
    db.add(ImportTemplateRevision(template_id=t.id, version=t.version, mapping_json=t.mapping_json, fingerprint=t.fingerprint, name=t.name, actor_user_id=staff.id))
    db.commit()
    audit(db, staff.id, "template.rollback", "import_template", t.id, {"fromVersion": version, "newVersion": t.version})
    return {"ok": True, "template": serialize_template(t, db.get(User, t.user_id))}


@app.get("/api/admin/dashboard")
def admin_dashboard(staff: User = Depends(require_staff), db: Session = Depends(db_session)):
    orders = db.scalars(select(Order)).all()
    unpaid = 0.0
    for o in orders:
        total = o.final_total if o.final_total is not None else o.preliminary_total
        unpaid += max(0, total - o.paid_amount)
    return {"ok": True, "metrics": {
        "customers": db.scalar(select(func.count(User.id)).where(User.role == "customer")) or 0,
        "orders": len(orders),
        "inWork": sum(1 for o in orders if o.status == "in_work"),
        "ready": sum(1 for o in orders if o.status == "ready"),
        "managerQueue": sum(1 for o in orders if o.status == "manager_processing"),
        "unpaidAmount": round(unpaid,2),
    }}


@app.get("/api/admin/users")
def admin_users(admin: User = Depends(require_admin), db: Session = Depends(db_session)):
    rows = db.scalars(select(User).order_by(User.created_at.desc())).all()
    return {"ok": True, "users": [public_user(x) for x in rows]}


@app.post("/api/admin/staff")
def create_staff(data: StaffCreate, admin: User = Depends(require_admin), db: Session = Depends(db_session)):
    if data.role not in STAFF_ROLES or data.role == "admin":
        raise HTTPException(400, "Недопустимая роль")
    email = data.email.lower().strip()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Email уже используется")
    perms = data.permissions if data.permissions is not None else DEFAULT_PERMISSIONS[data.role]
    u = User(name=data.name, email=email, phone=data.phone, password_hash=hash_password(data.password), role=data.role, permissions_json=json.dumps(perms, ensure_ascii=False))
    db.add(u); db.commit(); db.refresh(u)
    audit(db, admin.id, "staff.create", "user", u.id, {"role":u.role})
    return {"ok": True, "user": public_user(u)}


@app.patch("/api/admin/users/{user_id}")
def patch_user(user_id: int, data: UserAdminPatch, admin: User = Depends(require_admin), db: Session = Depends(db_session)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Пользователь не найден")
    if u.id == admin.id and data.isBlocked:
        raise HTTPException(400, "Нельзя заблокировать самого себя")
    changes = {}
    if data.isBlocked is not None: u.is_blocked=data.isBlocked; changes["isBlocked"]=data.isBlocked
    if data.blockReason is not None: u.block_reason=data.blockReason; changes["blockReason"]=data.blockReason
    if data.discountPercent is not None: u.discount_percent=data.discountPercent; changes["discountPercent"]=data.discountPercent
    if data.subscription3dUntil is not None: u.subscription_3d_until=data.subscription3dUntil; changes["subscription3dUntil"]=data.subscription3dUntil.isoformat()
    if data.role is not None:
        if data.role not in STAFF_ROLES|{"customer"}: raise HTTPException(400,"Недопустимая роль")
        if data.role == "admin" and u.id != admin.id: raise HTTPException(403,"Дополнительного главного администратора можно создавать только отдельной процедурой")
        u.role=data.role; changes["role"]=data.role
    if data.permissions is not None: u.permissions_json=json.dumps(data.permissions,ensure_ascii=False); changes["permissions"]=data.permissions
    u.updated_at=utcnow(); db.commit()
    audit(db, admin.id, "user.update", "user", u.id, changes)
    return {"ok":True,"user":public_user(u)}


@app.get("/api/admin/orders")
def admin_orders(staff: User = Depends(require_staff), db: Session = Depends(db_session)):
    rows = db.scalars(select(Order).order_by(Order.created_at.desc())).all()
    result=[]
    for o in rows:
        result.append(serialize_order(o, db.get(User,o.user_id)))
    return {"ok":True,"orders":result}


@app.patch("/api/admin/orders/{order_id}")
def patch_order(order_id:int, data:OrderAdminPatch, staff:User=Depends(require_staff), db:Session=Depends(db_session)):
    o=db.get(Order,order_id)
    if not o: raise HTTPException(404,"Заказ не найден")
    if staff.role == "viewer": raise HTTPException(403,"Режим только для просмотра")
    if staff.role == "production" and any(x is not None for x in [data.paymentStatus,data.finalTotal,data.paidAmount]): raise HTTPException(403,"Производство не может менять финансовые поля")
    if staff.role == "accounting" and any(x is not None for x in [data.status,data.internalComment]): raise HTTPException(403,"Бухгалтерия меняет только оплату")
    changes={}
    if data.status is not None:
        if data.status not in ORDER_STATUSES: raise HTTPException(400,"Недопустимый статус")
        o.status=data.status; changes["status"]=data.status
        if data.status in {"issued","cancelled"} and not o.completed_at: o.completed_at=utcnow()
        if data.status not in {"issued","cancelled"}: o.completed_at=None
    if data.paymentStatus is not None:
        if data.paymentStatus not in PAYMENT_STATUSES: raise HTTPException(400,"Недопустимый статус оплаты")
        o.payment_status=data.paymentStatus; changes["paymentStatus"]=data.paymentStatus
    if data.finalTotal is not None: o.final_total=max(0,data.finalTotal); changes["finalTotal"]=o.final_total
    if data.paidAmount is not None: o.paid_amount=max(0,data.paidAmount); changes["paidAmount"]=o.paid_amount
    if data.internalComment is not None: o.internal_comment=data.internalComment; changes["internalComment"]=data.internalComment
    # derive payment status unless explicitly given
    total=o.final_total if o.final_total is not None else o.preliminary_total
    if data.paymentStatus is None:
        o.payment_status="paid" if total>0 and o.paid_amount>=total else ("partial" if o.paid_amount>0 else "unpaid")
    o.updated_at=utcnow(); db.commit()
    audit(db,staff.id,"order.update","order",o.id,changes)
    return {"ok":True,"order":serialize_order(o,db.get(User,o.user_id))}


@app.get("/api/admin/audit")
def audit_list(admin:User=Depends(require_admin), db:Session=Depends(db_session)):
    rows=db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(200)).all()
    return {"ok":True,"items":[{"id":x.id,"actorUserId":x.actor_user_id,"action":x.action,"targetType":x.target_type,"targetId":x.target_id,"details":json.loads(x.details_json or '{}'),"createdAt":ensure_aware(x.created_at).isoformat()} for x in rows]}


# Static site mounted last so /api routes keep priority.
app.mount("/", StaticFiles(directory=PUBLIC, html=True), name="site")