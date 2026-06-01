# syntax=docker/dockerfile:1

# ============================================================
# STAGE 1: Build Rust dependencies (cached unless Cargo.* changes)
# ============================================================
FROM rust:1.86 AS rust-deps
WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    musl-dev g++ libpq-dev libssl-dev pkg-config \
    && rm -rf /var/lib/apt/lists/* \
    && rustup target add x86_64-unknown-linux-musl

ENV OPENSSL_STATIC=1 OPENSSL_DIR=/usr \
    OPENSSL_INCLUDE_DIR=/usr/include \
    OPENSSL_LIB_DIR=/usr/lib/x86_64-linux-gnu \
    LIBPQ_STATIC=1

# Copy manifests first — layer is cached unless these change
COPY api/Cargo.toml api/Cargo.lock ./

# Create dummy source matching the real module structure
# (cargo builds all dependencies; the dummy compiles trivially
#  so subsequent real build only recompiles changed source files)
RUN mkdir -p src/routes && \
    echo "fn main() {}" > src/main.rs && \
    echo 'pub mod db; pub mod model; pub mod mork_api; pub mod routes; pub mod schema; pub mod sse_utils;' > src/lib.rs && \
    touch src/db.rs src/model.rs src/mork_api.rs src/schema.rs src/sse_utils.rs && \
    echo 'pub mod health; pub mod spaces; pub mod sse; pub mod tokens; pub mod translations;' > src/routes/mod.rs && \
    for m in health spaces sse tokens translations; do echo "// stub" > "src/routes/$m.rs"; done

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    cargo build --release --target x86_64-unknown-linux-musl --lib

# ============================================================
# STAGE 2: Build real binary (only compiles changed source)
# ============================================================
FROM rust-deps AS rust-builder
COPY api/src ./src
COPY api/migrations ./migrations
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    cargo build --release --target x86_64-unknown-linux-musl

# ============================================================
# STAGE 3: Python translation virtual environment
# ============================================================
FROM python:3.11-alpine AS python-builder
WORKDIR /build

# All deps are pure Python (hyperon=0.1.x, rdflib) — no compiler toolchain needed
COPY translations/requirements.txt requirements.txt

RUN --mount=type=cache,target=/root/.cache/pip \
    python3 -m venv /venv && \
    /venv/bin/pip install --no-deps -r requirements.txt && \
    /venv/bin/pip uninstall -y pip setuptools wheel

COPY translations /translations

# ============================================================
# STAGE 4: Minimal runtime image
# ============================================================
FROM python:3.11.7-alpine3.19
WORKDIR /app

# Rust binary
COPY --from=rust-builder \
    /build/target/x86_64-unknown-linux-musl/release/api \
    /usr/local/bin/

# Python venv and translation scripts
COPY --from=python-builder /venv /venv
COPY --from=python-builder /translations /translations

# Config
COPY Rocket.toml .
RUN mkdir -p static temp

EXPOSE 8000
ENTRYPOINT ["api"]
