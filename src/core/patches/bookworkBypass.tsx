import patcher from '@core/patcher';
import logger from '@logger';
import utilities from '@utilities';
import { storages } from '@handlers/state';
import { common } from '@core/modules';
import { TextWithMaths } from '@core/components/katex';
import { createStyleSheet, commonStyles } from '@core/stylesheet';

const { findReact, findInReactTree, lazyDefine } = utilities;
const { bookwork, preferences } = storages;
const { React } = common;

const { styles } = createStyleSheet({
    item: {
        backgroundColor: 'var(--colours-selected)',
        color: 'var(--palette-white)',
        width: 'fit-content',
        paddingBlock: '0.4em',
        paddingInline: '0.6em',
        borderRadius: '4px'
    },
    images: {
        justifyContent: 'space-between',
        gap: '1em',
        marginBlock: '0.5em'
    },
    // Circling glow for the correct answer
    glow: {
        outline: '3px solid #00ff88',
        boxShadow: '0 0 0 4px rgba(0, 255, 136, 0.35), 0 0 18px 6px rgba(0, 255, 136, 0.55)',
        borderRadius: '12px',
        animation: 'azalea-glow-pulse 1.6s ease-in-out infinite',
        zIndex: 5
    }
});

// Inject the keyframes once
if (!document.getElementById('azalea-glow-style')) {
    const style = document.createElement('style');
    style.id = 'azalea-glow-style';
    style.textContent = `
        @keyframes azalea-glow-pulse {
            0%, 100% { box-shadow: 0 0 0 4px rgba(0, 255, 136, 0.35), 0 0 18px 6px rgba(0, 255, 136, 0.55); }
            50%      { box-shadow: 0 0 0 6px rgba(0, 255, 136, 0.5),  0 0 28px 10px rgba(0, 255, 136, 0.75); }
        }
    `;
    document.head.appendChild(style);
}

const BookworkSection = ({ answers }: { answers: any[]; azalea: boolean }) => {
    return (
        <div id="azalea-wac-content" style={commonStyles.merge(x => [x.textCenter, { marginInline: '2em', marginTop: '1em' }])}>
            <h3 style={{ marginInline: '1em' }}>
                Stored answers for this code:
            </h3>
            <div style={commonStyles.merge(x => [x.flex, x.row, { justifyContent: 'space-around', gap: '1em', flexWrap: 'wrap' }])}>
                {answers
                    .filter(store => Array.isArray(store.answers) && store.answers.length > 0)
                    .sort((a, b) => b.date - a.date)
                    .slice(0, 3)
                    .map((store, i) => {
                        const answers: any[] = store.answers.map(answer =>
                            isNaN(+answer) ? answer : `$${answer}$`
                        );
                        const imageAnswers = answers.filter(a => typeof a === 'string' && a.includes('assets.'));
                        const textAnswers = answers.filter(a => !(typeof a === 'string' && a.includes('assets.')));

                        return (
                            <div style={{ marginBlock: '1em' }} key={i}>
                                <div style={styles.item}>
                                    <h6 style={{ fontWeight: 'bold', color: 'var(--palette-white)', margin: 0 }}>
                                        ({new Date(store.date).toLocaleString()})
                                    </h6>
                                    <div>
                                        {imageAnswers.length > 0 && (
                                            <div style={commonStyles.merge(x => [x.flex, x.column, styles.images])}>
                                                {imageAnswers.map((answer, i) => (
                                                    <img
                                                        src={answer}
                                                        key={i}
                                                        style={{ maxWidth: '100%', height: 'auto', flexGrow: 1 }}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        {textAnswers.length > 0 && (
                                            <TextWithMaths
                                                text={textAnswers.join('$,\\;\\;$')}
                                                style={{ margin: 0, padding: 0, color: 'var(--palette-white)' }}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
            </div>
        </div>
    );
};

function normalise(text: string) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9.]/g, '')
        .trim();
}

function handler() {
    // New dialog-based bookwork check
    const dialog = document.querySelector('[class*="_DialogContent_"]');
    if (!dialog) return;

    // Already injected?
    if (document.getElementById('azalea-wac-content')) return;

    const codeChip = document.querySelector('[class*="_Bookwork_"]');
    if (!codeChip) return;

    const raw = codeChip.textContent?.trim() || '';
    const code = raw.replace(/bookwork\s*/i, '').trim(); // "2B"
    if (!code) return;

    logger.log('Bookwork check detected:', code);

    const stored = bookwork.get(code) ?? [];
    const answers = Array.isArray(stored)
        ? stored.filter((x: any) => Array.isArray(x.answers) && x.answers.length > 0)
        : [];

    // Inject the stored-answers UI at the top of the dialog
    const title = dialog.querySelector('[class*="_DialogTitle_"]') || dialog.firstElementChild;
    if (title && answers.length > 0) {
        const container = document.createElement('div');
        // We render via React later if possible; for reliability we also do a pure DOM fallback
        title.parentElement?.insertBefore(container, title.nextSibling);

        // Simple pure-DOM version of the stored answers (works even if React patch fails)
        container.id = 'azalea-wac-content';
        container.style.cssText = 'text-align:center;margin:12px 0;';
        container.innerHTML = `
            <div style="font-weight:600;margin-bottom:8px;">Stored answers for ${code}:</div>
            ${answers
                .slice(0, 3)
                .map(
                    (s: any) =>
                        `<div style="display:inline-block;background:var(--colours-selected,#7c3aed);color:white;padding:6px 10px;border-radius:8px;margin:4px;">
                            ${s.answers.join(' · ')}
                            <div style="font-size:11px;opacity:0.8">${new Date(s.date).toLocaleString()}</div>
                        </div>`
                )
                .join('')}
        `;
    }

    // Highlight + auto-select matching options
    const options = [...document.querySelectorAll('[class*="_Option_"][role="radio"]')] as HTMLElement[];

    if (answers.length === 0) {
        logger.info('No stored answers for', code);
        return;
    }

    const storedTexts = answers.flatMap((s: any) => s.answers.map((a: string) => normalise(String(a))));

    options.forEach(opt => {
        const optText = normalise(opt.innerText || '');
        const isMatch = storedTexts.some(st => st && optText.includes(st));

        if (isMatch) {
            // Circling glow
            opt.style.outline = '3px solid #00ff88';
            opt.style.boxShadow = '0 0 0 4px rgba(0,255,136,0.35), 0 0 18px 6px rgba(0,255,136,0.55)';
            opt.style.borderRadius = '12px';
            opt.style.animation = 'azalea-glow-pulse 1.6s ease-in-out infinite';
            opt.style.zIndex = '5';

            logger.log('Matched option:', opt.innerText.slice(0, 60));

            // Auto-select if enabled
            if (preferences.get('autoBookwork') !== false) {
                // Small delay so the UI is ready
                setTimeout(() => {
                    opt.click();
                    logger.log('Auto-selected matching bookwork option');
                }, 180);
            }
        }
    });
}

export default async function () {
    const page = await lazyDefine(() => document.querySelector('#root') || document.body, undefined, Infinity);

    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                handler();
            }
        }
    });

    observer.observe(page, { childList: true, subtree: true });

    // Also run once in case the dialog is already open
    handler();

    return () => observer.disconnect();
}
