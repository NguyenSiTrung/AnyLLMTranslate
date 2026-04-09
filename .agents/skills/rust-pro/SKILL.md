---
name: rust-pro
description: Master Rust 1.75+ with modern async patterns, advanced type system features, and production-ready systems programming. Expert in the latest Rust ecosystem including Tokio, axum, and cutting-edge crates. Use PROACTIVELY for Rust development, performance optimization, or systems programming.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Rust Pro — Modern Rust Development

> **Philosophy:** Leverage the type system for compile-time correctness. Zero-cost abstractions over runtime overhead.
> **Core Principle:** THINK about ownership, lifetimes, and safety constraints BEFORE writing code.

---

## 🎯 Selective Reading Rule

**Read ONLY sections relevant to your task!** Check the decision tree below.

---

## 1. When to Use Rust

### Decision Tree

```
What are you building?
│
├── High-performance service / low latency
│   └── ✅ Rust (axum + Tokio)
│
├── Systems tool / CLI
│   └── ✅ Rust (clap + tokio/std)
│
├── WebAssembly module
│   └── ✅ Rust (wasm-bindgen)
│
├── Quick script / prototype
│   └── ❌ Use Python or Node.js
│
├── Team has no Rust experience
│   └── ⚠️ Consider learning curve vs benefits
│
└── Existing non-Rust codebase
    └── ⚠️ Rust for new components via FFI, not rewrite
```

---

## 2. Framework & Crate Selection

### Web Frameworks

| Framework | Best For | Notes |
|-----------|----------|-------|
| **axum** | Modern web services | Tower ecosystem, best ergonomics |
| **actix-web** | Max throughput | Actor model, mature |
| **warp** | Composable filters | Functional style |

### Essential Crates

| Need | Crate | Why |
|------|-------|-----|
| Async runtime | `tokio` | Industry standard, full-featured |
| Serialization | `serde` + `serde_json` | Zero-cost, derive macros |
| Error handling | `thiserror` (libs) / `anyhow` (apps) | Ergonomic error types |
| HTTP client | `reqwest` | async, TLS, cookies |
| Database | `sqlx` (compile-time) / `diesel` (ORM) | Both async-capable |
| CLI | `clap` | Derive-based, full-featured |
| Logging | `tracing` | Structured, async-aware |
| Testing | `proptest` / `criterion` | Property-based / benchmarks |

### Selection Questions to Ask:
1. Is this a library or application? (affects error handling choice)
2. What's the async requirement? (Tokio vs std)
3. Database needed? (sqlx vs diesel vs none)
4. What's the deployment target? (Linux, WASM, embedded?)

---

## 3. Ownership & Lifetime Principles

### Decision Matrix

| Situation | Use | Why |
|-----------|-----|-----|
| Transfer ownership | `T` (move) | Caller doesn't need it |
| Read-only access | `&T` | Borrow, no allocation |
| Mutable access | `&mut T` | Exclusive borrow |
| Shared ownership | `Arc<T>` | Multiple owners, thread-safe |
| Interior mutability | `Mutex<T>` / `RwLock<T>` | Shared + mutable |
| Heap allocation | `Box<T>` | Large data, trait objects |
| Optional ownership | `Option<T>` | May or may not have value |

### Lifetime Rules

```
1. Each reference has a lifetime
2. Compiler infers most lifetimes (elision)
3. Add explicit lifetimes only when compiler can't infer
4. 'static = lives for entire program (strings, leaked data)
5. Prefer owned types in structs over references when possible
```

### Common Lifetime Patterns

| Pattern | When |
|---------|------|
| `fn foo(s: &str) -> &str` | Return borrows from input |
| `struct Foo<'a> { data: &'a str }` | Struct borrows external data |
| `fn foo(s: String) -> String` | Owned in, owned out (simplest) |

---

## 4. Async Patterns

### Tokio Runtime Selection

| Runtime | Use When |
|---------|----------|
| `#[tokio::main]` | Application entry point |
| `tokio::runtime::Builder` | Custom thread pool config |
| `tokio::task::spawn` | Concurrent tasks |
| `tokio::task::spawn_blocking` | CPU-bound work in async context |

### Async Best Practices

| Do | Don't |
|----|-------|
| `tokio::join!` for concurrent awaits | Sequential `await` for independent ops |
| `tokio::select!` for first-completes | Busy-loop polling |
| Channels (`mpsc`, `broadcast`) for communication | Shared `Mutex` for message passing |
| `spawn_blocking` for CPU work | Block the async runtime |
| Backpressure via bounded channels | Unbounded channels in production |

### Channel Selection

| Channel | Use When |
|---------|----------|
| `mpsc` | Many producers, one consumer |
| `broadcast` | All consumers get every message |
| `watch` | Latest-value only (config updates) |
| `oneshot` | Single response (request-reply) |

---

## 5. Error Handling Strategy

### Library vs Application

| Context | Crate | Pattern |
|---------|-------|---------|
| **Library** | `thiserror` | Custom enum with `#[error]` derive |
| **Application** | `anyhow` | `anyhow::Result<T>` with `.context()` |
| **Mixed** | Both | thiserror at boundaries, anyhow internally |

### Error Pattern

```
Domain errors:
├── Define with thiserror (typed, matchable)
├── Use ? operator for propagation
├── Add .context() for debugging info
└── Convert at API boundaries (-> HTTP status)

Recovery:
├── Retry transient errors (network, DB)
├── Fail fast on logic errors
├── Log with tracing::error!
└── Return structured error responses
```

---

## 6. Performance Optimization

### Optimization Priority (Do in Order)

| Priority | Action | Impact |
|----------|--------|--------|
| 1 | **Profile first** | cargo-flamegraph, criterion | 
| 2 | **Algorithm** | O(n²) → O(n log n) |
| 3 | **Allocations** | Reduce heap allocs, use `&str` over `String` |
| 4 | **Cache locality** | `Vec<T>` over `LinkedList`, SoA over AoS |
| 5 | **Parallelism** | rayon for data parallelism |
| 6 | **SIMD** | portable-simd for hot loops |

### Zero-Cost Abstraction Rules

| Abstraction | Cost | Use Freely |
|-------------|------|------------|
| Generics | Zero (monomorphized) | ✅ |
| Iterators | Zero (optimized to loops) | ✅ |
| Closures | Zero (usually inlined) | ✅ |
| Trait objects (`dyn`) | Vtable indirection | ⚠️ When needed |
| `Arc`/`Mutex` | Atomic ops / locking | ⚠️ Minimize contention |

---

## 7. Project Structure

### Standard Layout

```
my-project/
├── src/
│   ├── main.rs          # Binary entry
│   ├── lib.rs           # Library root
│   ├── config.rs        # Configuration
│   ├── error.rs         # Error types
│   ├── routes/          # HTTP handlers (axum)
│   ├── services/        # Business logic
│   ├── models/          # Domain types
│   └── db/              # Database layer
├── tests/               # Integration tests
├── benches/             # Benchmarks
├── Cargo.toml
└── rust-toolchain.toml
```

### Cargo.toml Best Practices

| Setting | Purpose |
|---------|---------|
| `[workspace]` | Multi-crate projects |
| `[features]` | Optional functionality |
| `[profile.release]` | `lto = true`, `strip = true` for small binaries |
| `rust-version` | MSRV for compatibility |

---

## 8. Testing Strategy

### Test Types

| Type | Location | Purpose |
|------|----------|---------|
| Unit | `#[cfg(test)] mod tests` in source | Logic, pure functions |
| Integration | `tests/` directory | API, multi-module |
| Property-based | `proptest!` macro | Invariant verification |
| Benchmark | `benches/` with criterion | Performance regression |
| Doc tests | `/// # Examples` | API usage examples |

### Testing Patterns

| Pattern | Use When |
|---------|----------|
| `assert_eq!` / `assert_ne!` | Value comparison |
| `#[should_panic]` | Expected panics |
| `tokio::test` | Async test functions |
| Mock traits | External dependencies |
| `tempfile` crate | File system tests |

---

## 9. Unsafe Code Principles

### When Unsafe is Justified

| Reason | Example |
|--------|---------|
| FFI with C libraries | `extern "C"` functions |
| Performance-critical hot paths | Manual SIMD, pointer arithmetic |
| Implementing safe abstractions | `Vec`, `Arc` internals |

### Unsafe Rules

1. **Minimize scope** — smallest possible `unsafe` block
2. **Document invariants** — `// SAFETY: ...` comment required
3. **Wrap in safe API** — unsafe internals, safe public interface
4. **Audit regularly** — `cargo audit`, `cargo deny`
5. **Test extensively** — Miri for undefined behavior detection

---

## 10. Decision Checklist

Before implementing:

- [ ] **Rust is the right choice for this?** (not over-engineering)
- [ ] **Async vs sync decided?** (based on I/O vs CPU workload)
- [ ] **Error strategy chosen?** (thiserror vs anyhow)
- [ ] **Crate selections justified?** (not adding unnecessary deps)
- [ ] **Ownership model clear?** (who owns what data)
- [ ] **Tests planned?** (unit + integration + benchmarks if perf-critical)

---

## 🔗 Related Skills

| Need | Skill |
|------|-------|
| API design patterns | `@[skills/api-patterns]` |
| Database design | `@[skills/database-design]` |
| Performance profiling | `@[skills/performance-profiling]` |
| Security review | `@[skills/vulnerability-scanner]` |
| Deployment | `@[skills/deployment-procedures]` |

---

## Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|-------|
| `.unwrap()` in production code | Handle errors with `?` or `.expect("reason")` |
| `.clone()` to fight borrow checker | Redesign ownership model |
| `Arc<Mutex<T>>` everywhere | Use channels or redesign data flow |
| Unsafe without SAFETY comment | Document every invariant |
| Block async runtime with sync I/O | Use `spawn_blocking` |
| Add crates for trivial functionality | Use std library first |
| Skip `clippy` warnings | `cargo clippy -- -W clippy::all` |
| Manual memory management | Trust RAII, use smart pointers |

---

> **Remember:** Rust's compiler is your ally, not your enemy. If it won't compile, there's usually a design issue to address, not a workaround to find.
