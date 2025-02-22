import { describe, it, before } from 'node:test';
import * as assert from 'node:assert/strict';
import {
	createComponent,
	render,
	renderComponent,
	renderSlot,
} from '../../../dist/runtime/server/index.js';
import { jsx } from '../../../dist/jsx-runtime/index.js';
import { createRenderContext, loadRenderer } from '../../../dist/core/render/index.js';
import { createAstroJSXComponent, renderer as jsxRenderer } from '../../../dist/jsx/index.js';
import { createBasicEnvironment } from '../test-utils.js';
import { Pipeline } from '../../../dist/core/pipeline.js';

const createAstroModule = (AstroComponent) => ({ default: AstroComponent });
const loadJSXRenderer = () => loadRenderer(jsxRenderer, { import: (s) => import(s) });

describe('core/render', () => {
	describe('Astro JSX components', () => {
		let env;
		before(async () => {
			env = createBasicEnvironment({
				renderers: [await loadJSXRenderer()],
			});
		});

		it('Can render slots', async () => {
			const Wrapper = createComponent((result, _props, slots = {}) => {
				return render`<div>${renderSlot(result, slots['myslot'])}</div>`;
			});

			const Page = createAstroJSXComponent(() => {
				return jsx(Wrapper, {
					children: [
						jsx('p', {
							slot: 'myslot',
							className: 'n',
							children: 'works',
						}),
					],
				});
			});

			const mod = createAstroModule(Page);
			const ctx = await createRenderContext({
				route: { type: 'page', pathname: '/index', component: 'src/pages/index.mdx' },
				request: new Request('http://example.com/'),
				env,
				mod,
			});

			const pipeline = new Pipeline(env);
			const response = await pipeline.renderRoute(ctx, mod);

			assert.equal(response.status, 200);

			const html = await response.text();
			assert.equal(html.includes('<div><p class="n">works</p></div>'), true);
		});

		it('Can render slots with a dash in the name', async () => {
			const Wrapper = createComponent((result, _props, slots = {}) => {
				return render`<div>${renderSlot(result, slots['my-slot'])}</div>`;
			});

			const Page = createAstroJSXComponent(() => {
				return jsx('main', {
					children: [
						jsx(Wrapper, {
							// Children as an array
							children: [
								jsx('p', {
									slot: 'my-slot',
									className: 'n',
									children: 'works',
								}),
							],
						}),
						jsx(Wrapper, {
							// Children as a VNode
							children: jsx('p', {
								slot: 'my-slot',
								className: 'p',
								children: 'works',
							}),
						}),
					],
				});
			});

			const mod = createAstroModule(Page);
			const ctx = await createRenderContext({
				route: { type: 'page', pathname: '/index', component: 'src/pages/index.mdx' },
				request: new Request('http://example.com/'),
				env,
				mod,
			});
			const pipeline = new Pipeline(env);
			const response = await pipeline.renderRoute(ctx, mod);

			assert.equal(response.status, 200);

			const html = await response.text();
			assert.equal(
				html.includes(
					'<main><div><p class="n">works</p></div><div><p class="p">works</p></div></main>'
				),
				true
			);
		});

		it('Errors in JSX components are raised', async () => {
			const Component = createAstroJSXComponent(() => {
				throw new Error('uh oh');
			});

			const Page = createComponent((result) => {
				return render`<div>${renderComponent(result, 'Component', Component, {})}</div>`;
			});

			const mod = createAstroModule(Page);
			const ctx = await createRenderContext({
				route: { type: 'page', pathname: '/index', component: 'src/pages/index.mdx' },
				request: new Request('http://example.com/'),
				env,
				mod,
			});

			const pipeline = new Pipeline(env);
			const response = await pipeline.renderRoute(ctx, mod);

			try {
				await response.text();
				assert.equal(false, true, 'should not have been successful');
			} catch (err) {
				assert.equal(err.message, 'uh oh');
			}
		});
	});
});
