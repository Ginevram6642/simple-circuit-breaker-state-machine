# simple-circuit-breaker-state-machine

A small circuit breaker state machine that tracks consecutive failures and transitions between closed, open, and half-open states, gating whether a call is permitted based on configurable thresholds.

## Usage

```js
import { CircuitBreaker } from './src/index.js';

const breaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeout: 1000, // milliseconds
});

if (breaker.canCall()) {
  try {
    // perform the guarded operation
    breaker.recordSuccess();
  } catch (err) {
    breaker.recordFailure();
  }
}
```

## Why this exists

When a downstream service is failing, hammering it with retries makes things worse. A circuit breaker lets you fail fast for a while, then probe recovery with a single trial call. This library implements that pattern as a pure state machine with no timers or I/O, so it is easy to embed and test. The trade-off is that it does not schedule the transition out of the open state by itself; the caller must poll `state` or `canCall()` (or call `recordSuccess`/`recordFailure`) to trigger the time-based transition. This keeps the library free of background timers, which are a common source of resource leaks and test flakiness.

## Awkward edge

The transition from open to half-open happens lazily on the next call to `state` or `canCall()`. If you never inspect the breaker, it will remain logically open even after `resetTimeout` has elapsed. This is intentional: the library does not run a timer. In a typical request path you call `canCall()` before each attempt, so the transition is observed exactly when it matters.

## API

### `new CircuitBreaker({ failureThreshold, resetTimeout, clock })`

- `failureThreshold` (required): positive integer. Number of consecutive failures that opens the circuit.
- `resetTimeout` (required): non-negative finite number. Milliseconds to wait before allowing a trial call.
- `clock` (optional): function returning current time in milliseconds. Defaults to `Date.now`. Inject a fake clock for deterministic tests.

Throws `TypeError` if any argument is invalid.

### Properties and methods

- `breaker.state` — returns `'closed'`, `'open'`, or `'half-open'`.
- `breaker.canCall()` — returns `true` if a call is permitted in the current state.
- `breaker.recordSuccess()` — records a successful call. In closed state resets the failure count; in half-open state closes the breaker.
- `breaker.recordFailure()` — records a failed call. In closed state increments the failure count and may open the breaker; in half-open state reopens the breaker.
- `breaker.reset()` — forces the breaker back to closed state and clears the failure count.
