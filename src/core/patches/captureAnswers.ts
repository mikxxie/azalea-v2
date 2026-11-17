import logger from '@logger';
import utilities from '@utilities';
import { storages } from '@core/handlers/state';

const { findReact, findInTree, findInReactTree, isEmpty } = utilities;
const { bookwork } = storages;

function processAnswers(input: Record<string, any> = {}) {
    const answers: string[] = [];

    if (!isEmpty(input?.number_fields)) {
        Object.values(input.number_fields).forEach((field: any) => {
            if (field?.value != null && String(field.value).trim()) {
                answers.push(String(field.value).trim());
            }
        });
    }

    if (!isEmpty(input?.cards)) {
        Object.values(input.cards).forEach((card: any) => {
            if (card?.slot_ref && card?.content?.[0]?.text) {
                answers.push(String(card.content[0].text).trim());
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
                answers.push(String(choice.content[0].text).trim());
            }
        });
    }

    return answers.filter(Boolean);
}

function getAnswersFromDom(): string[] {
    const answers: string[] = [];

    document
        .querySelectorAll('input[class*="_TextField_"], textarea[class*="_TextField_"]')
        .forEach(el => {
            const value = (el as HTMLInputElement | HTMLTextAreaElement).value?.trim();
            if (value) answers.push(value);
        });

    document
        .querySelectorAll(
            '[class*="_Option_"][aria-checked="true"], [role="radio"][aria-checked="true"]'
        )
        .forEach(el => {
            const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (text) answers.push(text);
        });

    return [...new Set(answers)];
}

function getBookworkCode(questionInfoFiber: any): string | null {
    const fromProps = questionInfoFiber?.memoizedProps?.bookworkCode;
    if (fromProps && String(fromProps).trim()) {
        return String(fromProps).trim().toUpperCase();
    }

    const chip = document.querySelector('[class*="_Bookwork_"], [class*="Bookwork"]');
    if (chip?.textContent) {
        const code = chip.textContent.replace(/bookwork\s*/i, '').trim();
        if (code) return code.toUpperCase();
    }

    const selectedTask = document.querySelector(
        '[class*="_TaskItemLink_"][class*="_Selected_"], [class*="_Selected_"][class*="TaskItem"]'
    );
    const label = selectedTask?.textContent?.trim() || '';
    if (/^[A-Z]?\d+[A-Z]?$/i.test(label)) return label.toUpperCase();

    return null;
}

function handler() {
    const possibleQuestionWrapper = document.querySelector(
        '[class*="_QuestionWrapper_"]'
    ) as HTMLDivElement | null;
    const possibleQuestionInfo = document.querySelector('[class*="_QuestionInfo_"]');

    if (!possibleQuestionWrapper || !possibleQuestionInfo) {
        return; // not on a question page
    }

    let id = '';
    let answers: string[] = [];
    let code: string | null = null;

    try {
        const QuestionWrapper = findReact(possibleQuestionWrapper);
        const QuestionInfo = findReact(possibleQuestionInfo);

        code = getBookworkCode(QuestionInfo);

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
        logger.debug('React capture failed', e);
    }

    if (!code) code = getBookworkCode(null);
    if (answers.length === 0) answers = getAnswersFromDom();

    // Don't store task label as answer
    if (code) {
        answers = answers.filter(a => a.trim().toUpperCase() !== code);
    }

    if (!code || answers.length < 1) {
        logger.debug('Answers failed to parse or no answers selected:', {
            id,
            code,
            answers
        });
        return;
    }

    const sanitise = (str: string) => str.replace(/\$.*?\$/g, '').replace(/ +/g, ' ');

    bookwork.set(code, [
        ...(bookwork.get(code) ?? []).filter(
            (x: any) => sanitise(x.id || '') !== sanitise(id || '')
        ),
        { id: id || `q-${Date.now()}`, answers, date: Date.now() }
    ]);

    logger.log(`Saved bookwork ${code}:`, answers);
}

export default async function () {
    // Original behaviour: capture on submit click / enter, while answer is still present
    document.addEventListener('pointerdown', handler, { capture: true });
    document.addEventListener('keydown', handler, { capture: true });

    return () => {
        document.removeEventListener('pointerdown', handler, { capture: true });
        document.removeEventListener('keydown', handler, { capture: true });
    };
}
