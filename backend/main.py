from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from auth import router as auth_router
from database import create_tables
from orders import router as orders_router
from shops import router as shops_router
from subscriptions import router as subscriptions_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    yield


app = FastAPI(title="KahveCell API", lifespan=lifespan)
app.include_router(auth_router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(subscriptions_router, prefix="/api/v1")
app.include_router(shops_router, prefix="/api/v1")
app.include_router(orders_router, prefix="/api/v1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_class=PlainTextResponse)
def home() -> str:
    return "çalışıyor"
