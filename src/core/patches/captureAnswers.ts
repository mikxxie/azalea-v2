import logger from '@logger';
import utilities from '@utilities';
import { storages } from '@core/handlers/state';

const { findReact, findInTree, findInReactTree, isEmpty } = utilities;
const { bookwork } = storages;

function processAnswers(input: Record<string, Record<string, any>>) {
    const answers: string[] = [];

    if (!isEmpty(input?.number_fields)) {
        Object.values(input.number_fields).forEach((field: any) => {
            if (field?.value) answers.push(String(field.value));
        });
    }

    if (!isEmpty(input?.cards)) {
        Object.values(input.cards).forEach((card: any) => {
            if (card?.slot_ref && card?.content?.[0]?.text) {
                answers.push(card.content[0].text);
            }
        });
    }

    if (!isEmpty(input?.choices)) {
        Object.values(input.choices).forEach((choice: any) => {
            if (!choice?.selected) return;

            if (choice.content?.[0]?.element === 'image') {
                const src = choice.content[0].src;
                const base = (window as any).__sparxweb?.urls?.contentAssets || '';
                answers.push(base ? `${base}/${src}` : src);
                return;
            }

            if (choice.content?.[0]?.text) {
                answers.push(choice.content[0].text);
            }
        });
    }

    // Fallback only to actual answer fields, never to selected task labels or generic selected elements.
    if (answers.length === 0) {
        document.querySelectorAll('input[class*="_TextField_"], textarea[class*="_TextField_"]').forEach(el => {
            const value = (el as HTMLInputElement | HTMLTextAreaElement).value?.trim();
            if (value) answers.push(value);
        });
    }

    return answers;
}

function getBookworkCode(): string | null {
    const chip = document.querySelector('[class*="_Bookwork_"], [class*="Bookwork"]');
    if (chip?.textContent) {
        const code = chip.textContent.replace(/bookwork\s*/i, '').trim();
        if (code) return code;
    }

    // Sparx currently exposes an empty bookworkCode prop, so use the selected task link instead.
    const selectedTask = document.querySelector(
        '[class*="_Selected_"][class*="TaskItem"], [class*="_TaskItemLink_"][class*="_Selected_"]'
    );
    const label = selectedTask?.textContent?.trim() || '';
    // Require the whole selected label to be a task code; don't extract a code from arbitrary text.
    return /^[A-Z]?\d+[A-Z]?$/i.test(label) ? label.toUpperCase() : null;
}

function isSuccessResult(result: Element | null): result is HTMLElement {
    const text = result?.textContent?.trim() || '';
    return !!result && /\b(?:correct|well\s*done)\b/i.test(text);
}

function captureSuccessfulAnswer(result: HTMLElement, processedResults: WeakMap<HTMLElement, string>) {
    const resultText = result.textContent?.trim() || '';
    if (!isSuccessResult(result) || processedResults.get(result) === resultText) return;

    const possibleWrapper =
        document.querySelector('[class*="_QuestionWrapper_"]') ||
        document.querySelector('[class*="QuestionWrapper"]') ||
        document.querySelector('[class*="_Question_"]');
    if (!possibleWrapper) return;

    const code = getBookworkCode();
    if (!code) {
        logger.debug('Capture skipped: no selected bookwork code', { resultText });
        return;
    }

    let answers: string[] = [];
    let id = '';

    try {
        const questionWrapper = findReact(possibleWrapper);
        const endpoint = findInReactTree(
            questionWrapper?.memoizedProps?.children,
            (x: any) => x?.layout && x?.input
        );

        if (endpoint) {
            answers = processAnswers(endpoint.input);

            const questionText = findInTree(
                endpoint.layout,
                (x: any) => x?.type?.includes?.('question-text'),
                { walkable: ['content'] }
            );
            id =
                findInTree(questionText, (x: any) => x?.element === 'text', {
                    walkable: ['content']
                })?.text || '';
        }
    } catch (e) {
        logger.debug('React tree walk failed; trying answer fields', e);
    }

    if (answers.length === 0) answers = processAnswers({});

    // Never store the task label itself as an answer.
    answers = answers.filter(answer => answer.trim().toUpperCase() !== code);
    if (answers.length === 0) {
        logger.debug('Capture skipped: no answer value', { code, resultText });
        return;
    }

    const sanitise = (str: string) => str.replace(/\$.*?\$/g, '').replace(/ +/g, ' ');
    const existing = bookwork.get(code) ?? [];
    bookwork.set(code, [
        ...existing.filter((x: any) => sanitise(x.id || '') !== sanitise(id)),
        { id: id || `q-${Date.now()}`, answers, date: Date.now() }
    ]);

    // Mark only after a successful save, so missing answer data can be retried if the result updates.
    processedResults.set(result, resultText);
    logger.log(`Saved bookwork ${code}:`, answers);
}

function containsResultBanner(node: Node): boolean {
    if (!(node instanceof Element)) return false;
    return (
        node.matches('[class*="_ResultInfoWrapper_"]') ||
        !!node.querySelector('[class*="_ResultInfoWrapper_"]')
    );
}

export default async function () {
    // Saving is driven only by insertion/updates to the result banner. Typing and navigation
    // mutations elsewhere on the page cannot capture partial answers or re-save stale values.
    const processedResults = new WeakMap<HTMLElement, string>();
    const observer = new MutationObserver(records => {
        const result = document.querySelector('[class*="_ResultInfoWrapper_"]') as HTMLElement | null;
        if (!result) return;

        const resultChanged = records.some(record => {
            if (result.contains(record.target) || record.target === result) return true;
            return [...record.addedNodes].some(containsResultBanner);
        });
        if (!resultChanged || !isSuccessResult(result)) return;

        // Allow the site's answer state to settle after it renders the success message.
        setTimeout(() => captureSuccessfulAnswer(result, processedResults), 400);
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
}
