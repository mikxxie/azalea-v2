import logger from '@logger';
import utilities from '@utilities';
import { storages } from '@handlers/state';
import { common } from '@core/modules';
import { TextWithMaths } from '@core/components/katex';
import { createStyleSheet, commonStyles } from '@core/stylesheet';

const { lazyDefine } = utilities;
const { bookwork } = storages;
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
    }
});

// Rainbow ring keyframes (inject once)
if (!document.getElementById('azalea-glow-style')) {
    const style = document.createElement('style');
    style.id = 'azalea-glow-style';
    style.textContent = `
        @keyframes azalea-rainbow-spin {
            0%   { filter: hue-rotate(0deg); }
            100% { filter: hue-rotate(360deg); }
        }
        @keyframes azalea-rainbow-pulse {
            0%, 100% { opacity: 0.85; transform: scale(1); }
            50%      { opacity: 1; transform: scale(1.02); }
        }
        .azalea-rainbow-glow {
            position: relative !important;
            z-index: 5 !important;
            border-radius: 14px !important;
        }
        .azalea-rainbow-glow::before {
            content: '';
            position: absolute;
            inset: -4px;
            border-radius: 16px;
            padding: 3px;
            background: conic-gradient(
                from 0deg,
                #ff0040, #ff8000, #ff0, #0f0, #0ff, #40f, #f0f, #ff0040
            );
            -webkit-mask:
                linear-gradient(#fff 0 0) content-box,
                linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            animation:
                azalea-rainbow-spin 2.5s linear infinite,
                azalea-rainbow-pulse 1.8s ease-in-out infinite;
            pointer-events: none;
            z-index: -1;
        }
        .azalea-rainbow-glow::after {
            content: '';
            position: absolute;
            inset: -8px;
            border-radius: 20px;
            background: conic-gradient(
                from 180deg,
                rgba(255,0,64,0.35),
                rgba(255,128,0,0.35),
                rgba(255,255,0,0.35),
                rgba(0,255,0,0.35),
                rgba(0,255,255,0.35),
                rgba(64,0,255,0.35),
                rgba(255,0,255,0.35),
                rgba(255,0,64,0.35)
            );
            filter: blur(10px);
            opacity: 0.55;
            animation: azalea-rainbow-spin 3.5s linear infinite reverse;
            pointer-events: none;
            z-index: -2;
        }
    `;
    document.head.appendChild(style);
}

function normalise(text: string) {
    return String(text)
        .toLowerCase()
        // drop latex commands / braces but keep numbers and units letters
        .replace(/\\[a-z]+/gi, '')
        .replace(/[^a-z0-9.]/g, '')
        .trim();
}

/** True if stored answer and option text refer to the same value */
function isMatch(storedRaw: string, optionRaw: string) {
    const s = normalise(storedRaw);
    const o = normalise(optionRaw);
    if (!s || !o) return false;
    if (s === o) return true;
    if (o.includes(s) || s.includes(o)) return true;

    // Compare leading numeric token (handles "6.32" vs "6.32g/cm3...")
    const num = (t: string) => (t.match(/\d+(?:\.\d+)?/) || [])[0] || '';
    const sn = num(s);
    const on = num(o);
    if (sn && on && sn === on && (s.includes(sn) && o.includes(on))) {
        // same number + shared unit-ish letters if any
        const unit = (t: string) => t.replace(/[\d.]+/g, '');
        const su = unit(s);
        const ou = unit(o);
        if (!su || !ou) return true;
        return ou.includes(su) || su.includes(ou);
    }
    return false;
}

function applyRainbowGlow(el: HTMLElement) {
    el.classList.add('azalea-rainbow-glow');
}

function handler() {
    const dialog =
        document.querySelector('[class*="_DialogContent_"]') ||
        document.querySelector('[role="dialog"]');
    if (!dialog) return;

    const codeChip =
        dialog.querySelector('[class*="_Bookwork_"], [class*="Bookwork"]') ||
        document.querySelector('[class*="_Bookwork_"], [class*="Bookwork"]');
    if (!codeChip) return;

    const code = (codeChip.textContent || '')
        .replace(/bookwork\s*/i, '')
        .trim()
        .toUpperCase();
    if (!code) return;

    // Only skip if we already handled THIS code
    const existing = document.getElementById('azalea-wac-content') as HTMLElement | null;
    if (existing?.dataset?.code === code) {
        // Still try to paint glow if options mounted later
        paintMatches(code);
        return;
    }
    existing?.remove();

    logger.log('Bookwork check detected:', code);

    const stored = bookwork.get(code) ?? bookwork.get(code.toLowerCase()) ?? [];
    const answers = Array.isArray(stored)
        ? stored.filter((x: any) => Array.isArray(x.answers) && x.answers.length > 0)
        : [];

    logger.log('Stored entries for', code, answers);

    if (answers.length > 0) {
        const title =
            dialog.querySelector('[class*="_DialogTitle_"]') || dialog.firstElementChild;
        const container = document.createElement('div');
        container.id = 'azalea-wac-content';
        container.dataset.code = code;
        container.style.cssText = 'text-align:center;margin:12px 0;';
        container.innerHTML = `
            <div style="font-weight:600;margin-bottom:8px;">Stored answers for ${code}:</div>
            ${answers
                .slice(0, 3)
                .map(
                    (s: any) => `
                <div style="display:inline-block;background:var(--colours-selected,#7c3aed);color:white;padding:6px 10px;border-radius:8px;margin:4px;">
                    ${s.answers.join(' · ')}
                    <div style="font-size:11px;opacity:0.8">${new Date(s.date).toLocaleString()}</div>
                </div>`
                )
                .join('')}
        `;
        if (title?.parentElement) {
            title.parentElement.insertBefore(container, title.nextSibling);
        } else {
            dialog.prepend(container);
        }
    } else {
        logger.info('No stored answers for', code);
    }

    // Options often mount a tick later
    if (!paintMatches(code)) {
        setTimeout(() => paintMatches(code), 200);
        setTimeout(() => paintMatches(code), 500);
    }
}

function paintMatches(code: string) {
    const stored = bookwork.get(code) ?? bookwork.get(code.toLowerCase()) ?? [];
    const answers = Array.isArray(stored)
        ? stored.filter((x: any) => Array.isArray(x.answers) && x.answers.length > 0)
        : [];
    if (!answers.length) return false;

    const options = [
        ...document.querySelectorAll(
            '[class*="_Option_"][role="radio"], [role="radio"][class*="_Option_"], [class*="_GridOption_"] [class*="_Option_"], [class*="_Option_"]'
        )
    ] as HTMLElement[];

    if (!options.length) {
        logger.debug('No options yet for', code);
        return false;
    }

    const storedAnswers = answers.flatMap((s: any) => s.answers.map(String));
    let matched = 0;

    options.forEach(opt => {
        if (opt.dataset.azaleaGlow === code) return;

        const optText = opt.innerText || '';
        const hit = storedAnswers.some(a => isMatch(a, optText));
        if (!hit) return;

        applyRainbowGlow(opt);
        opt.dataset.azaleaGlow = code;
        matched++;
        logger.log('Matched option:', optText.replace(/\s+/g, ' ').slice(0, 80));
        // NO auto-select — glow only
    });

    return matched > 0 || options.length > 0;
}

export default async function () {
    const page = await lazyDefine(
        () => document.querySelector('#root') || document.body,
        undefined,
        Infinity
    );

    const observer = new MutationObserver(() => {
        handler();
    });

    observer.observe(page, { childList: true, subtree: true });
    handler();

    return () => observer.disconnect();
}
