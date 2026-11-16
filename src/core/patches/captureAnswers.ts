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

    // Fallback to actual answer fields only; don't treat selected task labels as answers.
    if (answers.length === 0) {
        document.querySelectorAll('input[class*="_TextField_"], textarea[class*="_TextField_"]').forEach(el => {
            const value = (el as HTMLInputElement | HTMLTextAreaElement).value?.trim();
            if (value) answers.push(value);
        });
    }

    return answers;
}

function getBookworkCode(): string | null {
    // Try several places Sparx has used for the code
    const chip = document.querySelector('[class*="_Bookwork_"], [class*="Bookwork"]');
    if (chip?.textContent) {
        const code = chip.textContent.replace(/bookwork\s*/i, '').trim();
        if (code) return code;
    }

    // This React-props fallback was not useful on the current question UI:
    // QuestionInfo exposes bookworkCode as an empty string, so it cannot identify the task.
    /*
    const infoEl = document.querySelector(
        '[class*="_QuestionInfo_"], [class*="QuestionInfo"], [class*="_Info_"]'
    );
    if (infoEl) {
        try {
            const fiber = findReact(infoEl);
            const code =
                fiber?.memoizedProps?.bookworkCode ||
                fiber?.memoizedProps?.code ||
                fiber?.pendingProps?.bookworkCode;
            if (code) return String(code);
        } catch {}
    }
    */

    // The current question UI marks its task in the selected task item (for example, "4A").
    const selectedTask = document.querySelector(
        '[class*="_Selected_"][class*="TaskItem"], [class*="_TaskItemLink_"][class*="_Selected_"]'
    );
    const match = selectedTask?.textContent?.trim().match(/\b[A-Z]?\d+[A-Z]?\b/i);
    if (match) return match[0].toUpperCase();

    return null;
}

function handler() {
    // Only capture after the site confirms the answer was correct.
    const result = document.querySelector('[class*="_ResultInfoWrapper_"]');
    const resultText = result?.textContent?.trim() || '';
    if (!/\b(?:correct|well\s*done)\b/i.test(resultText)) return;

    // Only run when we are actually on a question
    const possibleWrapper =
        document.querySelector('[class*="_QuestionWrapper_"]') ||
        document.querySelector('[class*="QuestionWrapper"]') ||
        document.querySelector('[class*="_Question_"]');

    if (!possibleWrapper) {
        return;
    }

    let code = getBookworkCode();
    let answers: string[] = [];
    let id = '';

    try {
        const QuestionWrapper = findReact(possibleWrapper);
        const endpoint = findInReactTree(
            QuestionWrapper?.memoizedProps?.children,
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
        logger.debug('React tree walk failed, falling back to DOM', e);
    }

    if (!code) {
        // Last resort – look for any chip that looks like a bookwork code
        const chips = document.querySelectorAll('[class*="Chip"], [class*="chip"]');
        for (const chip of chips) {
            const t = chip.textContent || '';
            if (/^[A-Z]?\d+[A-Z]?$/i.test(t.trim()) || /bookwork/i.test(t)) {
                code = t.replace(/bookwork\s*/i, '').trim();
                break;
            }
        }
    }

    if (!code || answers.length === 0) {
        logger.debug('Capture skipped', { code, answers, resultText });
        return;
    }

    const sanitise = (str: string) => str.replace(/\$.*?\$/g, '').replace(/ +/g, ' ');

    const existing = bookwork.get(code) ?? [];
    bookwork.set(code, [
        ...existing.filter((x: any) => sanitise(x.id || '') !== sanitise(id)),
        { id: id || `q-${Date.now()}`, answers, date: Date.now() }
    ]);

    logger.log(`Saved bookwork ${code}:`, answers);
}

export default async function () {
    // Capture on click / key (when user submits an answer); handler ignores non-success states.
    document.addEventListener('pointerdown', handler, { capture: true });
    document.addEventListener('keydown', handler, { capture: true });

    // Also try after a short delay when the page changes, once the result banner is rendered.
    const obs = new MutationObserver(() => {
        setTimeout(handler, 400);
    });
    obs.observe(document.body, { childList: true, subtree: true });

    return () => {
        document.removeEventListener('pointerdown', handler, { capture: true });
        document.removeEventListener('keydown', handler, { capture: true });
        obs.disconnect();
    };
}
