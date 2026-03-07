from fastapi import APIRouter

from app.api.v1 import admin, auth, health, jobs, public, registry

router = APIRouter()
router.include_router(health.router)
router.include_router(auth.router)
router.include_router(admin.router)
router.include_router(jobs.router)
router.include_router(registry.router)
router.include_router(public.router)
