const CLOSED = 'closed';
const OPEN = 'open';
const HALF_OPEN = 'half-open';

/**
 * A circuit breaker state machine that gates calls based on consecutive failures.
 *
 * States:
 * - closed: calls are permitted. Consecutive failures are counted.
 * - open: calls are blocked. After `resetTimeout` milliseconds (as measured by the
 *   injected clock), the breaker moves to half-open.
 * - half-open: a single trial call is permitted. If it succeeds, the breaker closes.
 *   If it fails, the breaker reopens for another `resetTimeout`.
 *
 * The clock is injected as a function returning milliseconds (like `Date.now`).
 * Tests can pass a fake clock for determinism.
 */
export class CircuitBreaker {
  /**
   * @param {object} options
   * @param {number} options.failureThreshold - number of consecutive failures that opens the circuit
   * @param {number} options.resetTimeout - milliseconds to wait before allowing a trial call
   * @param {() => number} [options.clock] - function returning current time in ms
   */
  constructor({ failureThreshold, resetTimeout, clock = Date.now }) {
    if (!Number.isInteger(failureThreshold) || failureThreshold <= 0) {
      throw new TypeError('failureThreshold must be a positive integer');
    }
    if (!Number.isFinite(resetTimeout) || resetTimeout < 0) {
      throw new TypeError('resetTimeout must be a non-negative finite number');
    }
    if (typeof clock !== 'function') {
      throw new TypeError('clock must be a function');
    }
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.clock = clock;
    this._state = CLOSED;
    this._failureCount = 0;
    this._openedAt = null;
  }

  /**
   * Current state: 'closed', 'open', or 'half-open'.
   * @returns {string}
   */
  get state() {
    this._maybeTransitionToHalfOpen();
    return this._state;
  }

  /**
   * Whether a call is currently permitted.
   * @returns {boolean}
   */
  canCall() {
    this._maybeTransitionToHalfOpen();
    return this._state !== OPEN;
  }

  /**
   * Record a successful call. In closed state this resets the failure count.
   * In half-open state this closes the breaker.
   */
  recordSuccess() {
    this._maybeTransitionToHalfOpen();
    if (this._state === CLOSED) {
      this._failureCount = 0;
    } else if (this._state === HALF_OPEN) {
      this._state = CLOSED;
      this._failureCount = 0;
      this._openedAt = null;
    }
    // In open state a success is not expected (calls are blocked), but if it
    // happens we ignore it to keep the state machine simple.
  }

  /**
   * Record a failed call. In closed state this increments the failure count and
   * may open the breaker. In half-open state this reopens the breaker.
   */
  recordFailure() {
    this._maybeTransitionToHalfOpen();
    if (this._state === CLOSED) {
      this._failureCount += 1;
      if (this._failureCount >= this.failureThreshold) {
        this._tripOpen();
      }
    } else if (this._state === HALF_OPEN) {
      this._tripOpen();
    }
    // In open state a failure is ignored (calls are blocked).
  }

  /**
   * Reset the breaker to closed state, clearing failure count and opened timestamp.
   * Useful for manual intervention or testing.
   */
  reset() {
    this._state = CLOSED;
    this._failureCount = 0;
    this._openedAt = null;
  }

  _tripOpen() {
    this._state = OPEN;
    this._openedAt = this.clock();
    this._failureCount = 0;
  }

  _maybeTransitionToHalfOpen() {
    if (this._state === OPEN && this._openedAt !== null && this.clock() - this._openedAt >= this.resetTimeout) {
      this._state = HALF_OPEN;
    }
  }
}
