# syntax=docker/dockerfile:1

# ============================================================
# STAGE 1: Rust build environment with cargo-chef
# ============================================================
FROM rust:1.86 AS chef
RUN apt-get update && apt-get install -y --no-install-recommends \
    musl-dev g++ libpq-dev libssl-dev pkg-config \
    && rm -rf /var/lib/apt/lists/* \
    && rustup target add x86_64-unknown-linux-musl \
    && cargo install cargo-chef --locked

# ============================================================
# STAGE 2: Dependency recipe planner
# ============================================================
FROM chef AS planner
COPY api /build/api
WORKDIR /build/api
ENV OPENSSL_STATIC=1 OPENSSL_DIR=/usr \
    OPENSSL_INCLUDE_DIR=/usr/include \
    OPENSSL_LIB_DIR=/usr/lib/x86_64-linux-gnu \
    LIBPQ_STATIC=1
RUN cargo chef prepare --recipe-path recipe.json

# ============================================================
# STAGE 3: Rust dependency cook + binary build
# ============================================================
FROM chef AS rust-builder
WORKDIR /build/api
ENV OPENSSL_STATIC=1 OPENSSL_DIR=/usr \
    OPENSSL_INCLUDE_DIR=/usr/include \
    OPENSSL_LIB_DIR=/usr/lib/x86_64-linux-gnu \
    LIBPQ_STATIC=1

# Cook dependencies (cached unless Cargo.toml/Cargo.lock changes)
COPY --from=planner /build/api/recipe.json recipe.json
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    cargo chef cook --release --target x86_64-unknown-linux-musl \
    --recipe-path recipe.json

# Copy source and build
COPY api/Cargo.toml api/Cargo.lock ./
COPY api/src ./src
COPY api/migrations ./migrations
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    cargo build --release --target x86_64-unknown-linux-musl

# ============================================================
# STAGE 4: Python translation virtual environment
# ============================================================
FROM python:3.11-alpine AS python-builder
WORKDIR /build

RUN apk add --no-cache gcc g++ musl-dev libffi-dev openssl-dev python3-dev

COPY translations/requirements.txt requirements.txt

RUN python3 -m venv /venv && \
    /venv/bin/pip install --no-deps --no-cache-dir -r requirements.txt && \
    /venv/bin/pip uninstall -y pip setuptools wheel

COPY translations /translations

# ============================================================
# STAGE 5: Minimal runtime image
# ============================================================
FROM python:3.11.7-alpine3.19
WORKDIR /app

# Rust binary
COPY --from=rust-builder \
    /build/api/target/x86_64-unknown-linux-musl/release/api \
    /usr/local/bin/

# Python venv and translation scripts
COPY --from=python-builder /venv /venv
COPY --from=python-builder /translations /translations

# Config
COPY Rocket.toml .
RUN mkdir -p static temp

EXPOSE 8000
ENTRYPOINT ["api"]
