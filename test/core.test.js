import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CircuitBreaker } from '../src/index.js';

// A simple fake clock that can be advanced manually.
function fakeClock(initial = 0) {
  let now = initial;
  return {
    now: () => now,
    advance: (ms) => { now += ms; },
  };
}

test('starts closed and allows calls', () => {
  const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 1000 });
  assert.equal(cb.state, 'closed');
  assert.equal(cb.canCall(), true);
});

test('opens after reaching failure threshold', () => {
  const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeout: 1000 });
  cb.recordFailure();
  assert.equal(cb.state, 'closed');
  assert.equal(cb.canCall(), true);
  cb.recordFailure();
  assert.equal(cb.state, 'open');
  assert.equal(cb.canCall(), false);
});

test('resets failure count on success in closed state', () => {
  const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 1000 });
  cb.recordFailure();
  cb.recordFailure();
  cb.recordSuccess();
  assert.equal(cb.state, 'closed');
  cb.recordFailure();
  cb.recordFailure();
  assert.equal(cb.state, 'closed'); // still closed because count reset
  cb.recordFailure();
  assert.equal(cb.state, 'open');
});

test('transitions to half-open after resetTimeout', () => {
  const clock = fakeClock(0);
  const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 500, clock: clock.now });
  cb.recordFailure();
  assert.equal(cb.state, 'open');
  clock.advance(499);
  assert.equal(cb.state, 'open');
  clock.advance(1);
  assert.equal(cb.state, 'half-open');
  assert.equal(cb.canCall(), true);
});

test('half-open success closes the breaker', () => {
  const clock = fakeClock(0);
  const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 100, clock: clock.now });
  cb.recordFailure();
  clock.advance(100);
  assert.equal(cb.state, 'half-open');
  cb.recordSuccess();
  assert.equal(cb.state, 'closed');
  assert.equal(cb.canCall(), true);
});

test('half-open failure reopens the breaker', () => {
  const clock = fakeClock(0);
  const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 100, clock: clock.now });
  cb.recordFailure();
  clock.advance(100);
  assert.equal(cb.state, 'half-open');
  cb.recordFailure();
  assert.equal(cb.state, 'open');
  assert.equal(cb.canCall(), false);
  // After another timeout it should go half-open again
  clock.advance(100);
  assert.equal(cb.state, 'half-open');
});

test('recordSuccess in open state is ignored', () => {
  const clock = fakeClock(0);
  const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 100, clock: clock.now });
  cb.recordFailure();
  assert.equal(cb.state, 'open');
  cb.recordSuccess();
  assert.equal(cb.state, 'open');
});

test('recordFailure in open state is ignored', () => {
  const clock = fakeClock(0);
  const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 100, clock: clock.now });
  cb.recordFailure();
  assert.equal(cb.state, 'open');
  cb.recordFailure();
  assert.equal(cb.state, 'open');
});

test('reset forces closed state', () => {
  const clock = fakeClock(0);
  const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 100, clock: clock.now });
  cb.recordFailure();
  assert.equal(cb.state, 'open');
  cb.reset();
  assert.equal(cb.state, 'closed');
  assert.equal(cb.canCall(), true);
  // failure count should be cleared
  cb.recordFailure();
  assert.equal(cb.state, 'open');
});

test('constructor validates inputs', () => {
  assert.throws(() => new CircuitBreaker({ failureThreshold: 0, resetTimeout: 100 }), TypeError);
  assert.throws(() => new CircuitBreaker({ failureThreshold: -1, resetTimeout: 100 }), TypeError);
  assert.throws(() => new CircuitBreaker({ failureThreshold: 1.5, resetTimeout: 100 }), TypeError);
  assert.throws(() => new CircuitBreaker({ failureThreshold: 1, resetTimeout: -1 }), TypeError);
  assert.throws(() => new CircuitBreaker({ failureThreshold: 1, resetTimeout: 100, clock: 'not a function' }), TypeError);
});

test('canCall returns false only when open', () => {
  const clock = fakeClock(0);
  const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 100, clock: clock.now });
  assert.equal(cb.canCall(), true);
  cb.recordFailure();
  assert.equal(cb.canCall(), false);
  clock.advance(100);
  assert.equal(cb.canCall(), true);
  cb.recordSuccess();
  assert.equal(cb.canCall(), true);
});
