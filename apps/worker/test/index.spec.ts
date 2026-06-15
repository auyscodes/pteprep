import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/types';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Hello World worker', () => {
	it('responds with Hello World! (unit style)', async () => {
		const request = new IncomingRequest('http://example.com');
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		expect(await response.text()).toMatchInlineSnapshot(`"{"service":"pteprep-api","status":"running"}"`);
	});

	it('responds with Hello World! (integration style)', async () => {
		const response = await SELF.fetch('https://example.com');
		expect(await response.text()).toMatchInlineSnapshot(`"{"service":"pteprep-api","status":"running"}"`);
	});
});

describe('Worker bindings', () => {
	it('Env type includes SCORING_QUEUE', () => {
		const _assert: Env['SCORING_QUEUE'] extends Queue ? true : never = true;
		expect(true).toBe(true);
	});

	it('Env type includes RATE_LIMITER', () => {
		const _assert: Env['RATE_LIMITER'] extends RateLimit ? true : never = true;
		expect(true).toBe(true);
	});
});
