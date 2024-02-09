import type { DevToolbarApp, DevToolbarMetadata } from '../../../../../@types/astro.js';
import type { DevToolbarHighlight } from '../../ui-library/highlight.js';
import {
	attachTooltipToHighlight,
	createHighlight,
	getElementsPositionInDocument,
	positionHighlight,
} from '../utils/highlight.js';
import { createWindowElement } from '../utils/window.js';
import { a11y } from './a11y.js';

const icon =
	'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 1 20 16"><path fill="#fff" d="M.6 2A1.1 1.1 0 0 1 1.7.9h16.6a1.1 1.1 0 1 1 0 2.2H1.6A1.1 1.1 0 0 1 .8 2Zm1.1 7.1h6a1.1 1.1 0 0 0 0-2.2h-6a1.1 1.1 0 0 0 0 2.2ZM9.3 13H1.8a1.1 1.1 0 1 0 0 2.2h7.5a1.1 1.1 0 1 0 0-2.2Zm11.3 1.9a1.1 1.1 0 0 1-1.5 0l-1.7-1.7a4.1 4.1 0 1 1 1.6-1.6l1.6 1.7a1.1 1.1 0 0 1 0 1.6Zm-5.3-3.4a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8Z"/></svg>';

type DynamicString = string | ((element: Element) => string);

export interface AuditRule {
	code: string;
	title: DynamicString;
	message: DynamicString;
}

export interface ResolvedAuditRule {
	code: string;
	title: string;
	message: string;
}

export interface AuditRuleWithSelector extends AuditRule {
	selector: string;
	match?: (element: Element) => boolean | null | undefined | void;
}

const rules = [...a11y];

const dynamicAuditRuleKeys: Array<keyof AuditRule> = ['title', 'message'];
function resolveAuditRule(rule: AuditRule, element: Element): ResolvedAuditRule {
	let resolved: ResolvedAuditRule = { ...rule } as any;
	for (const key of dynamicAuditRuleKeys) {
		const value = rule[key];
		if (typeof value === 'string') continue;
		resolved[key] = value(element);
	}
	return resolved;
}

export default {
	id: 'astro:audit',
	name: 'Audit',
	icon: icon,
	async init(canvas, eventTarget) {
		let audits: {
			highlightElement: DevToolbarHighlight;
			auditedElement: HTMLElement;
			rule: AuditRule;
		}[] = [];

		await lint();

		document.addEventListener('astro:after-swap', async () => lint());
		document.addEventListener('astro:page-load', async () => refreshLintPositions);

		function onPageClick(event: MouseEvent) {
			const target = event.target as Element | null;
			if (!target) return;
			if (!target.closest) return;
			if (target.closest('astro-dev-toolbar')) return;
			eventTarget.dispatchEvent(
				new CustomEvent('toggle-app', {
					detail: {
						state: false,
					},
				})
			);
		}
		eventTarget.addEventListener('app-toggled', (event: any) => {
			if (event.detail.state === true) {
				document.addEventListener('click', onPageClick, true);
			} else {
				document.removeEventListener('click', onPageClick, true);
			}
		});

		async function lint() {
			audits.forEach(({ highlightElement }) => {
				highlightElement.remove();
			});
			audits = [];
			canvas.getElementById('no-audit')?.remove();
			const selectorCache = new Map<string, NodeListOf<Element>>();

			for (const rule of rules) {
				const elements =
					selectorCache.get(rule.selector) ?? document.querySelectorAll(rule.selector);
				let matches: Element[] = [];
				if (typeof rule.match === 'undefined') {
					matches = Array.from(elements);
				} else {
					for (const element of elements) {
						if (rule.match(element)) {
							matches.push(element);
						}
					}
				}
				for (const element of matches) {
					await createAuditProblem(rule, element);
				}
			}

			if (audits.length > 0) {
				eventTarget.dispatchEvent(
					new CustomEvent('toggle-notification', {
						detail: {
							state: true,
						},
					})
				);

				const auditListWindow = createWindowElement(
					`
					<style>
						astro-dev-toolbar-window {
  	          left: initial;
              top: 8px;
              right: 8px;
              transform: none;
              width: 320px;
              padding: 0;
              overflow: hidden;
						}

						hr {
						  margin-bottom: 0;
						}

						h1 {
              padding: 18px;
              padding-bottom: 0;
						}

						ul, li {
						  margin: 0;
							padding: 0;
							list-style: none;
						}

						h1, h2 {
						  margin: 0;
						}

						h3 {
      		    margin: 0;
              margin-bottom: 8px;
              color: white;
              white-space: nowrap;
						}

						.audit-title {
						  font-weight: bold;
							color: white;
							margin-right: 1ch;
						}

						#audit-list {
  						display: flex;
              flex-direction: column;
              overflow: auto;
						}
					</style>

					<h1>Audits</h1>
					<hr />`
				);

				const auditListUl = document.createElement('ul');
				auditListUl.id = 'audit-list';
				audits.forEach((audit, index) => {
					const resolvedRule = resolveAuditRule(audit.rule, audit.auditedElement);
					const card = document.createElement('astro-dev-toolbar-card');

					console.log(index);
					console.log(audits.length);
					card.shadowRoot.innerHTML = `
					<style>
					 :host>button {
						  text-align: left;
							box-shadow: none !important;
							${
								index + 1 < audits.length
									? 'border-radius: 0 !important;'
									: 'border-radius: 0 0 8px 8px !important;'
							}
						}

						:host>button:hover {
						  cursor: pointer;
						}
					</style>`;

					card.clickAction = () => {
						audit.highlightElement.scrollIntoView();
						audit.highlightElement.focus();
					};
					const h3 = document.createElement('h3');
					h3.innerHTML = getDomPath(audit.auditedElement, true) as string;
					card.appendChild(h3);
					const div = document.createElement('div');
					const title = document.createElement('span');
					title.classList.add('audit-title');
					title.innerHTML = resolvedRule.title;
					div.appendChild(title);
					const description = document.createElement('span');
					description.classList.add('audit-description');
					description.innerHTML = resolvedRule.message;
					div.appendChild(description);
					card.appendChild(div);
					auditListUl.appendChild(card);
				});

				auditListWindow.appendChild(auditListUl);

				canvas.append(auditListWindow);
			} else {
				eventTarget.dispatchEvent(
					new CustomEvent('toggle-notification', {
						detail: {
							state: false,
						},
					})
				);

				const window = createWindowElement(
					`<style>
						header {
							display: flex;
						}

						h1 {
							display: flex;
							align-items: center;
							gap: 8px;
							font-weight: 600;
							color: #fff;
							margin: 0;
							font-size: 22px;
						}

						astro-dev-toolbar-icon {
							width: 1em;
						   height: 1em;
						   padding: 8px;
							display: block;
							background: green;
							border-radius: 9999px;
						}
					</style>
					<header>
						<h1><astro-dev-toolbar-icon icon="check-circle"></astro-dev-toolbar-icon>No accessibility issues detected.</h1>
					</header>
					<p>
						Nice work! This app scans the page and highlights common accessibility issues for you, like a missing "alt" attribute on an image.
					</p>
					`
				);

				canvas.append(window);
			}

			(['scroll', 'resize'] as const).forEach((event) => {
				window.addEventListener(event, refreshLintPositions);
			});
		}

		function refreshLintPositions() {
			const noAuditBlock = canvas.getElementById('no-audit');
			if (noAuditBlock) {
				const devOverlayRect = document
					.querySelector('astro-dev-toolbar')
					?.shadowRoot.querySelector('#dev-toolbar-root')
					?.getBoundingClientRect();

				noAuditBlock.style.top = `${
					(devOverlayRect?.top ?? 0) - (devOverlayRect?.height ?? 0) - 16
				}px`;
			}

			audits.forEach(({ highlightElement, auditedElement }) => {
				const rect = auditedElement.getBoundingClientRect();
				positionHighlight(highlightElement, rect);
			});
		}

		async function createAuditProblem(rule: AuditRule, originalElement: Element) {
			const computedStyle = window.getComputedStyle(originalElement);
			const targetedElement = (originalElement.children[0] as HTMLElement) || originalElement;

			// If the element is hidden, don't do anything
			if (targetedElement.offsetParent === null || computedStyle.display === 'none') {
				return;
			}

			// If the element is an image but not yet loaded, ignore it
			// TODO: We shouldn't ignore this, because it is valid for an image to not be loaded at start (e.g. lazy loading)
			if (originalElement.nodeName === 'IMG' && !(originalElement as HTMLImageElement).complete) {
				return;
			}

			const rect = originalElement.getBoundingClientRect();
			const highlight = createHighlight(rect, 'warning');
			const tooltip = buildAuditTooltip(rule, originalElement);

			// Set the highlight/tooltip as being fixed position the highlighted element
			// is fixed. We do this so that we don't mistakenly take scroll position
			// into account when setting the tooltip/highlight positioning.
			//
			// We only do this once due to how expensive computed styles are to calculate,
			// and are unlikely to change. If that turns out to be wrong, reconsider this.
			const { isFixed } = getElementsPositionInDocument(originalElement);
			if (isFixed) {
				tooltip.style.position = highlight.style.position = 'fixed';
			}

			attachTooltipToHighlight(highlight, tooltip, originalElement);

			canvas.append(highlight);
			audits.push({
				highlightElement: highlight,
				auditedElement: originalElement as HTMLElement,
				rule: rule,
			});
		}

		function buildAuditTooltip(rule: AuditRule, element: Element) {
			const tooltip = document.createElement('astro-dev-toolbar-tooltip');
			const { title, message } = resolveAuditRule(rule, element);

			tooltip.sections = [
				{
					icon: 'warning',
					title: escapeHtml(title),
				},
				{
					content: escapeHtml(message),
				},
			];

			const elementFile = element.getAttribute('data-astro-source-file');
			const elementPosition = element.getAttribute('data-astro-source-loc');

			if (elementFile) {
				const elementFileWithPosition =
					elementFile + (elementPosition ? ':' + elementPosition : '');

				tooltip.sections.push({
					content: elementFileWithPosition.slice(
						(window as DevToolbarMetadata).__astro_dev_toolbar__.root.length - 1 // We want to keep the final slash, so minus one.
					),
					clickDescription: 'Click to go to file',
					async clickAction() {
						// NOTE: The path here has to be absolute and without any errors (no double slashes etc)
						// or Vite will silently fail to open the file. Quite annoying.
						await fetch('/__open-in-editor?file=' + encodeURIComponent(elementFileWithPosition));
					},
				});
			}

			return tooltip;
		}

		function escapeHtml(unsafe: string) {
			return unsafe
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#039;');
		}
	},
} satisfies DevToolbarApp;

function getDomPath(el, noVerify) {
	// store the original element if verify is enabled. If it isn't, then don't even bother
	// taking up any memory for it.

	const origElem = el;

	if (!el) {
		console.error('No element provided');
		return;
	}

	const stack = [];
	let levelCount = 0;
	let nearestElemWithId = null;

	let sibParent;
	let sibSiblings;

	do {
		levelCount++;

		let sibCount = 0;
		let sibIndex = 0;
		sibParent = el?.parentNode;
		sibSiblings = sibParent?.children;

		if (sibSiblings) {
			sibSiblings = Array.from(sibSiblings).filter((sibElem) => el.nodeName == sibElem.nodeName);
		}

		// Iterate over the childNodes of the elements parentNode to get the
		// index to use
		if (sibSiblings) {
			for (let i = 0; i < sibSiblings.length; i++) {
				let sib = sibSiblings[i];

				//if ( sib.nodeName != el.nodeName )  continue;

				sibCount++;

				if (sib === el) {
					// If this is the correct element, then save the sibIndex
					// and stop looping
					sibIndex = sibCount;
					break;
				}
			}
		}

		if (el && el.hasAttribute('id') && el.id != '') {
			nearestElemWithId = el.id;

			// Turns out, if you have an id that starts with a numerical value, then you can't
			// use it in querySelector[All] unless you either escape it or add [id=] to it.
			if (/^[0-9]/.test(el.id)) {
				stack.unshift(`[id="${el.id}"]`);
			} else {
				stack.unshift(`#${el.id}`);
			}
		} else if (sibCount > 1) {
			stack.unshift(el.nodeName.toLowerCase() + ':nth-of-type(' + parseInt(sibIndex) + ')');
		} else {
			stack.unshift(el.nodeName.toLowerCase());
		}

		el = sibParent;
	} while (sibParent?.nodeType === Node.ELEMENT_NODE && nearestElemWithId === null);

	if (stack[0] === 'html') stack.shift();

	const result = stack.join(' > ');

	if (noVerify) return result;

	let selectionFromResult;

	try {
		selectionFromResult = document.querySelector(result);
	} catch (err) {
		console.error(
			`Encountered an exception when trying to verify querySelector(${result})\n\tError:`,
			err
		);
	}

	// If there's no matches when using querySelector() with the result string, then
	// return false;
	if (!selectionFromResult) {
		console.error(`Failed to find any document using querySelector(${result})`);
		return false;
	}

	// If there is a result, but its not the same element, then return false;
	else if (!origElem.isSameNode(selectionFromResult)) {
		console.error(
			`Element returned from querySelector(${result}) is not the same as the element provided`
		);
	}

	// If we got here, then the matched element is the same element, then it's been verified.
	return result;
}
