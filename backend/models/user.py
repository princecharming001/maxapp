"""
User Models - Pydantic schemas for user data
"""

import re
from pydantic import AliasChoices, BaseModel, ConfigDict, EmailStr, Field, field_validator
from typing import Optional, List, Any, Dict
from datetime import datetime
from enum import Enum


def _coerce_optional_body_metric(value: Any) -> Optional[float]:
    """Parse height/weight from float/int or strings like '180.3cm', '75 kg' (onboarding / DB legacy)."""
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        m = re.search(r"[\d.]+", s.replace(",", "."))
        if not m:
            return None
        try:
            return float(m.group(0))
        except ValueError:
            return None
    return None


_INTENSITY_ALIASES = {
    "chill": "chill", "easy": "chill", "light": "chill",
    "relaxed": "chill", "gentle": "chill", "slow": "chill",
    "standard": "standard", "normal": "standard",
    "moderate": "standard", "balanced": "standard", "medium": "standard",
    "sweatmode": "sweatmode", "sweat": "sweatmode", "sweat_mode": "sweatmode",
    "intense": "sweatmode", "hardcore": "sweatmode", "beast": "sweatmode",
    "full": "sweatmode", "max": "sweatmode",
}


def normalize_intensity_preference(value: Any) -> Optional[str]:
    """Map client synonyms onto the canonical chill/standard/sweatmode tokens.
    Unknown/blank values return None so the scheduler falls back to experience_level."""
    if value is None or value == "":
        return None
    s = str(value).strip().lower().replace("-", "_").replace(" ", "_")
    return _INTENSITY_ALIASES.get(s)


class ExperienceLevel(str, Enum):
    """User experience level with lookmaxxing"""
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class GoalType(str, Enum):
    """User improvement goals"""
    JAWLINE = "jawline"
    FAT_LOSS = "fat_loss"
    SKIN = "skin"
    POSTURE = "posture"
    SYMMETRY = "symmetry"
    HAIR = "hair"
    OVERALL = "overall"
    # Frontend goal IDs
    BONEMAX = "bonemax"
    HEIGHTMAX = "heightmax"
    SKINMAX = "skinmax"
    HAIRMAX = "hairmax"
    FITMAX = "fitmax"


class OnboardingData(BaseModel):
    """User onboarding questionnaire data (JSON on User — extra keys allowed for forward compat)."""

    model_config = ConfigDict(extra="allow")

    goals: List[GoalType] = Field(default_factory=list)
    experience_level: ExperienceLevel = ExperienceLevel.BEGINNER
    age: Optional[int] = None
    gender: Optional[str] = None
    # Storage rule:
    # - If unit_system == "metric": height is cm, weight is kg
    # - If unit_system == "imperial": height is total inches, weight is lbs
    # For internal calculations, prefer height_cm / weight_kg (always metric).
    height: Optional[float] = None
    weight: Optional[float] = None
    # Always-metric canonical fields (populated by backend on save; may be missing for legacy users)
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    activity_level: Optional[str] = None
    skin_type: Optional[str] = None
    # Routine intensity preference — gates the week-1 ramp and per-day task cap
    # across every maxx. "chill" eases in slowly (smallest week-1 load),
    # "standard" is a moderate ramp, "sweatmode" starts at full load on day one.
    # When unset, the scheduler falls back to experience_level / routine_level.
    intensity_preference: Optional[str] = Field(
        default=None,
        description="'chill' | 'standard' | 'sweatmode' — how aggressively to ramp the routine in week 1.",
    )
    equipment: List[str] = Field(default_factory=list)
    unit_system: str = Field(default="imperial", description="metric or imperial")
    timezone: str = Field(default="UTC", description="IANA timezone name, e.g. America/New_York")
    # Global schedule anchors — reused when starting any maxx module if already collected
    wake_time: Optional[str] = Field(default=None, description="Usual wake time HH:MM (24h), e.g. 07:00")
    sleep_time: Optional[str] = Field(default=None, description="Usual sleep time HH:MM (24h), e.g. 23:00")
    # Busy hours — fed to chatbot context so it plans routines around the
    # user's fixed obligations (work/school). work_schedule == "flexible"
    # means the user has no fixed daily window; work_start/end are null.
    work_schedule: Optional[str] = Field(
        default=None, description="'fixed' | 'flexible' — whether user has set work/school hours.",
    )
    work_start: Optional[str] = Field(default=None, description="Work/school start HH:MM (24h)")
    work_end: Optional[str] = Field(default=None, description="Work/school end HH:MM (24h)")
    # Arbitrary fixed commitments the scheduler must work around. Work / school
    # is just one of these (e.g. {"label":"Work","start":"09:00","end":"17:00",
    # "days":"weekdays"}) — preferred over the legacy work_* fields above. Each
    # entry: {"label": str, "start": "HH:MM", "end": "HH:MM", "days": <recur>}
    # where `days` is the recurrence: "all" (default) | "weekdays" | "weekends"
    # | a list of lowercase weekday names. The validator pushes tasks out of
    # each window only on the days it applies, and surfaces them to the coach.
    obligations: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Fixed commitments to avoid. Each: {label, start 'HH:MM', end 'HH:MM', days}.",
    )
    # Per-weekday overrides for the daily rhythm. Keyed by lowercase weekday
    # name ("monday".."sunday"). Each value may set wake_time, sleep_time,
    # get_ready_time (all "HH:MM" 24h). Any field omitted for a weekday inherits
    # the top-level default above; e.g. a later weekend wake is respected on
    # exactly those days. NOTE: day-specific commitments (a Mon/Wed class, a
    # weekday work block) are modeled with each obligation's own `days`
    # recurrence rather than per-weekday overrides — see `obligations`.
    weekly_timings: Optional[Dict[str, Dict[str, Any]]] = Field(
        default=None,
        description=(
            "Per-weekday rhythm overrides keyed by 'monday'..'sunday'. Each: "
            "{wake_time, sleep_time, get_ready_time}. Omitted fields inherit the "
            "top-level defaults. Day-specific commitments use obligations[].days."
        ),
    )
    # Day-shape depth (onboarding v2) — each feeds the human-time engine:
    #   work_location/commute_minutes -> derived "Commute" obligations (api.users)
    #   chronotype -> stated energy-peak prior surfaced in the life model
    #   dinner_time -> the protected dinner anchor in human_time.life_windows
    work_location: Optional[str] = Field(
        default=None, description="'office' | 'hybrid' | 'home' — where the user works, gates commute.",
    )
    commute_minutes: Optional[int] = Field(
        default=None, description="One-way commute in minutes; brackets the work block with Commute obligations.",
    )
    chronotype: Optional[str] = Field(
        default=None, description="'morning' | 'afternoon' | 'evening' — when the user feels sharpest.",
    )
    dinner_time: Optional[str] = Field(
        default=None, description="Usual dinner time HH:MM (24h); anchors the protected dinner window.",
    )
    completed: bool = False
    # Profile questionnaire v2 (collected before pay in app flow) — optional flag for clients
    questionnaire_v2_completed: Optional[bool] = None
    # Rank: face_structure, skin, hair, body, height (first = highest notification priority)
    priority_order: Optional[List[str]] = None
    appearance_concerns: Optional[List[str]] = None
    waist_cm: Optional[float] = None
    # Skin (conditional)
    primary_skin_concern: Optional[str] = None
    secondary_skin_concern: Optional[str] = None
    skincare_routine_level: Optional[str] = None
    # Hair (conditional)
    hair_family_history: Optional[str] = None
    hair_current_loss: Optional[str] = None
    hair_treatments_current: Optional[str] = None
    hair_side_effect_sensitivity: Optional[str] = None
    # Fitness / FitMax (conditional)
    fitmax_primary_goal: Optional[str] = None
    fitmax_training_experience: Optional[str] = None
    fitmax_equipment: Optional[str] = None
    fitmax_workout_days_per_week: Optional[int] = None
    preferred_workout_time: Optional[str] = Field(
        default=None, description="HH:MM 24h — legacy single workout anchor; kept in sync with the midpoint of preferred_workout_window for back-compat."
    )
    preferred_workout_window: Optional[List[str]] = Field(
        default=None, description="[start, end] 'HH:MM' 24h — the time RANGE reserved for the workout/strength block across all maxes (FitMax, HeightMax, etc.). Preferred over preferred_workout_time."
    )
    get_ready_time: Optional[str] = Field(
        default=None, description="HH:MM 24h — when the user gets ready / showers in the morning; anchors the AM bathroom routine (skin/hair/mewing)"
    )
    get_ready_minutes: Optional[int] = Field(
        default=None, description="How long the user takes to get ready in the morning, in minutes (clamped 10–90 by the scheduler). Sizes the AM morning_routine block and shifts the post-routine/AM-active windows later, so people who take longer to get ready get a roomier morning. Omitted = the biology default (~25 min)."
    )
    screen_hours_daily: Optional[str] = None
    scan_suggested_hair_focus: Optional[bool] = Field(
        default=None, description="True if latest scan metrics hinted at hair as a weak area"
    )
    post_subscription_onboarding: Optional[bool] = Field(
        default=None,
        description="When True, client should show post-pay scan insights then module select once.",
    )
    sendblue_connect_completed: Optional[bool] = Field(
        default=None,
        description="User tapped Continue on Sendblue screen after server saw their first inbound text.",
    )
    sendblue_sms_engaged: Optional[bool] = Field(
        default=None,
        description="True after first inbound SMS/iMessage to our Sendblue number; enables automated outbound SMS and unlocks Continue on the connect screen.",
    )
    facial_scan_summary: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Denormalized scan headline fields after first triple scan completes.",
    )
    main_app_tour_completed: Optional[bool] = Field(
        default=None,
        description="True after user finishes (or dismisses) the post-pay spotlight tour of the main tabs.",
    )

    @field_validator("height", "weight", "waist_cm", mode="before")
    @classmethod
    def parse_height_weight(cls, v: Any) -> Optional[float]:
        return _coerce_optional_body_metric(v)

    @field_validator("fitmax_workout_days_per_week", mode="before")
    @classmethod
    def coerce_fitmax_days(cls, v: Any) -> Optional[int]:
        if v is None or v == "":
            return None
        if isinstance(v, bool):
            return None
        try:
            n = int(float(str(v).strip()))
            return max(1, min(7, n))
        except (ValueError, TypeError):
            return None

    @field_validator("intensity_preference", mode="before")
    @classmethod
    def _normalize_intensity_preference(cls, v: Any) -> Optional[str]:
        return normalize_intensity_preference(v)


class UserProfile(BaseModel):
    """User profile metrics"""
    current_level: float = Field(default=0.0, ge=0, le=10)
    rank: int = Field(default=0, ge=0)
    total_users: int = Field(default=0, ge=0)
    streak_days: int = Field(default=0, ge=0)
    improvement_percentage: float = Field(default=0.0)
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    # Consecutive local days with every master-schedule checkbox done (see schedule_streak.py)
    master_schedule_streak: int = Field(default=0, ge=0)
    master_schedule_streak_last_perfect_date: Optional[str] = Field(
        default=None, description="YYYY-MM-DD in user's timezone when streak day was earned"
    )


class UserCreate(BaseModel):
    """Schema for user registration"""
    email: EmailStr
    password: str = Field(min_length=8, max_length=100)
    first_name: str = Field(..., min_length=1, max_length=50)
    # Optional — the sign-up form collects a single "Name"; last name may be blank.
    last_name: str = Field(default="", max_length=50)
    username: str = Field(..., min_length=3, max_length=30, pattern="^[a-zA-Z0-9_]+$")
    bio: Optional[str] = None
    phone_number: Optional[str] = Field(
        default=None,
        description="Optional E.164 phone for SMS; omit to add later in the app",
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "email": "user@example.com",
                "password": "securepassword123",
                "first_name": "John",
                "last_name": "Doe",
                "username": "johndoe",
                "phone_number": "+919876543210"
            }
        }


class UserLogin(BaseModel):
    """Login with email, username, or phone (JSON: `identifier` or legacy `email`)."""

    identifier: str = Field(..., validation_alias=AliasChoices("identifier", "email"))
    password: str


class ForgotPasswordSmsRequest(BaseModel):
    """Request SMS reset code — must match account phone on file."""

    phone_number: str = Field(..., min_length=7, description="E.164 or local with country code")


class ForgotPasswordSmsConfirm(BaseModel):
    """Complete reset after receiving SMS code."""

    phone_number: str = Field(..., min_length=7)
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_password: str = Field(..., min_length=8, max_length=100)


class AuthMessageResponse(BaseModel):
    message: str


class UserResponse(BaseModel):
    """Schema for user response (public data)"""
    id: str
    email: EmailStr
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    last_username_change: Optional[datetime] = None
    created_at: datetime
    is_paid: bool = False
    subscription_tier: Optional[str] = None
    subscription_status: Optional[str] = None
    subscription_end_date: Optional[datetime] = None
    billing_provider: Optional[str] = Field(
        default=None,
        description="stripe | apple — where the current subscription is billed",
    )
    onboarding: OnboardingData = Field(default_factory=OnboardingData)
    profile: UserProfile = Field(default_factory=UserProfile)
    first_scan_completed: bool = False
    is_admin: bool = False
    is_scan_user: bool = False
    phone_number: Optional[str] = None
    has_apns_token: bool = Field(
        default=False,
        description="True if an APNs device token is stored (iOS push can be delivered).",
    )
    coaching_tone: Optional[str] = Field(
        default="default",
        description="Bot tone preference. One of: default | hardcore | gentle | influencer.",
    )

    class Config:
        from_attributes = True


class UserInDB(BaseModel):
    """Full user model as stored in database"""
    email: EmailStr
    password_hash: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_paid: bool = False
    is_admin: bool = False
    is_scan_user: bool = False
    subscription_status: Optional[str] = None  # active, canceled, past_due
    subscription_id: Optional[str] = None
    subscription_end_date: Optional[datetime] = None
    stripe_customer_id: Optional[str] = None
    onboarding: OnboardingData = Field(default_factory=OnboardingData)
    profile: UserProfile = Field(default_factory=UserProfile)
    first_scan_completed: bool = False
    phone_number: Optional[str] = None


class TokenResponse(BaseModel):
    """JWT token response"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    """JWT token payload"""
    sub: str  # user_id
    exp: datetime
    type: str  # access or refresh
class TokenRefreshRequest(BaseModel):
    """Request to refresh access token"""
    refresh_token: str


class AccountUpdateRequest(BaseModel):
    """Request to update user account info"""

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    phone_number: Optional[str] = Field(
        default=None,
        description="Add when none on file, or update before SMS is linked (sendblue_sms_engaged false).",
    )


class BlockUserRequest(BaseModel):
    """Block another user from appearing in community channels for the current user."""

    blocked_user_id: str = Field(..., min_length=1, max_length=64)


class DeleteAccountRequest(BaseModel):
    """Confirm account deletion with password (App Store Guideline 5.1.1)."""

    password: str = Field(..., min_length=1, max_length=200)
