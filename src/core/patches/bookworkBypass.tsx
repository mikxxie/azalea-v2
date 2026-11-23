import logger from '@logger';
import utilities from '@utilities';
import { storages } from '@handlers/state';
import { common } from '@core/modules';
import { createStyleSheet, commonStyles } from '@core/stylesheet';

const { lazyDefine } = utilities;
const { bookwork } = storages;

const { styles } = createStyleSheet({
    item: {
        backgroundColor: 'var(--colours-selected)',
        color: 'var(--palette-white)',
        width: 'fit-content',
        paddingBlock: '0.4em',
        paddingInline: '0.6em',
        borderRadius: '4px'
    }
});

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

/** Expand latex / KaTeX-ish text into a comparable string */
function normalise(text: string) {
    return String(text)
        .toLowerCase()
        .replace(/\u200b/g, '') // zero-width space from KaTeX
        .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
        .replace(/\\times/g, 'x')
        .replace(/\\[a-z]+/gi, '')
        .replace(/−/g, '-') // unicode minus
        .replace(/[^a-z0-9./-]/g, '')
        .replace(/\/+/g, '/')
        .trim();
}

/** Turn multi-field answers like ['2','9'] or ['-2','9'] into '-2/9' when it looks like a fraction */
function expandAnswers(answers: string[]): string[] {
    const out = answers.map(String);
    if (out.length === 2 && out.every(a => /^-?\d+$/.test(a.trim()))) {
        out.push(`${out[0].trim()}/${out[1].trim()}`);
    }
    if (out.length === 1 && /^-?\d+\/\d+$/.test(out[0].trim())) {
        // already a fraction string
    }
    return out;
}

/**
 * Score how well stored answer matches option text.
 * Higher = better. 0 = no match.
 * Rejects bare single-digit / very short tokens that pollute includes().
 */
function matchScore(storedRaw: string, optionRaw: string): number {
    const s = normalise(storedRaw);
    const o = normalise(optionRaw);
    if (!s || !o) return 0;

    // Exact
    if (s === o) return 1000 + s.length;

    // Fraction exact after normalise (e.g. -2/9)
    if (/^-?\d+\/\d+$/.test(s) && o.includes(s)) return 800 + s.length;
    if (/^-?\d+\/\d+$/.test(s)) {
        // KaTeX often shows "2 9" stacked → digits may appear as "29" or interleaved
        const m = s.match(/^(-?)(\d+)\/(\d+)$/);
        if (m) {
            const [, sign, num, den] = m;
            // option contains both numerator and denominator near each other
            if (o.includes(num) && o.includes(den)) {
                const hasNeg =
                    sign === '-'
                        ? /^-|negative|minus/.test(optionRaw.toLowerCase()) || o.startsWith('-') || o.includes(`-${num}`)
                        : true;
                if (hasNeg) return 600 + s.length;
            }
        }
    }

    // Full stored string contained in option (require meaningful length)
    if (s.length >= 2 && o.includes(s)) return 400 + s.length;
    if (s.length >= 2 && s.includes(o) && o.length >= 2) return 300 + o.length;

    // Numeric + unit style (6.32 vs 6.32g/cm3) — only if stored number is not a single digit
    const sn = (s.match(/-?\d+(?:\.\d+)?/) || [])[0] || '';
    const on = (o.match(/-?\d+(?:\.\d+)?/) || [])[0] || '';
    if (sn && on && sn === on && sn.replace('-', '').length >= 2) {
        const unit = (t: string) => t.replace(/[\d./-]+/g, '');
        const su = unit(s);
        const ou = unit(o);
        if (!su || !ou || ou.includes(su) || su.includes(ou)) return 200 + sn.length;
    }

    // NEVER match on a lone single character / single digit via includes
    return 0;
}

function pickUsefulEntries(stored: any[]): any[] {
    if (!Array.isArray(stored)) return [];

    const withAnswers = stored.filter(
        (x: any) => Array.isArray(x.answers) && x.answers.length > 0
    );

    // Prefer real question-text ids over live-/q- timestamps
    const ranked = [...withAnswers].sort((a, b) => {
        const score = (e: any) => {
            const id = String(e.id || '');
            let s = 0;
            if (id && !id.startsWith('q-') && !id.startsWith('live-')) s += 100;
            if (id.startsWith('live-')) s += 50;
            // longer joined answers usually better
            s += String(e.answers.join('')).length;
            s += (e.date || 0) / 1e13; // slight recency
            return s;
        };
        return score(b) - score(a);
    });

    // Keep top few useful ones for UI; matching uses expand on these
    return ranked.slice(0, 5);
}

function getCandidateAnswers(entries: any[]): string[] {
    const set = new Set<string>();
    for (const e of entries) {
        for (const a of expandAnswers(e.answers.map(String))) {
            const n = normalise(a);
            // drop useless single-digit-only tokens from the candidate pool
            if (!n) continue;
            if (/^-?\d$/.test(n)) continue;
            set.add(a);
        }
    }
    return [...set];
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

    const existing = document.getElementById('azalea-wac-content') as HTMLElement | null;
    if (existing?.dataset?.code === code) {
        paintMatches(code);
        return;
    }
    existing?.remove();

    logger.log('Bookwork check detected:', code);

    const stored = bookwork.get(code) ?? bookwork.get(code.toLowerCase()) ?? [];
    const useful = pickUsefulEntries(Array.isArray(stored) ? stored : []);

    logger.log('Useful entries for', code, useful);

    if (useful.length > 0) {
        const title =
            dialog.querySelector('[class*="_DialogTitle_"]') || dialog.firstElementChild;
        const container = document.createElement('div');
        container.id = 'azalea-wac-content';
        container.dataset.code = code;
        container.style.cssText = 'text-align:center;margin:12px 0;';
        container.innerHTML = `
            <div style="font-weight:600;margin-bottom:8px;">Stored answers for ${code}:</div>
            ${useful
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

    if (!paintMatches(code)) {
        setTimeout(() => paintMatches(code), 200);
        setTimeout(() => paintMatches(code), 500);
    }
}

function paintMatches(code: string) {
    const stored = bookwork.get(code) ?? bookwork.get(code.toLowerCase()) ?? [];
    const useful = pickUsefulEntries(Array.isArray(stored) ? stored : []);
    if (!useful.length) return false;

    const options = [
        ...document.querySelectorAll(
            '[class*="_Option_"][role="radio"], [role="radio"][class*="_Option_"], [class*="_GridOption_"] [class*="_Option_"], [class*="_Option_"]'
        )
    ] as HTMLElement[];

    if (!options.length) {
        logger.debug('No options yet for', code);
        return false;
    }

    const candidates = getCandidateAnswers(useful);

    // Score every option; only glow the best (and ties within a small margin)
    const scored = options.map(opt => {
        const text = opt.innerText || '';
        let best = 0;
        let via = '';
        for (const a of candidates) {
            const sc = matchScore(a, text);
            if (sc > best) {
                best = sc;
                via = a;
            }
        }
        return { opt, best, via, text };
    });

    const max = Math.max(0, ...scored.map(s => s.best));
    if (max <= 0) {
        logger.info('No confident match for', code, { candidates });
        return true; // options exist, just no match
    }

    scored.forEach(({ opt, best, via, text }) => {
        if (best < max || best <= 0) return;
        if (opt.dataset.azaleaGlow === code) return;
        applyRainbowGlow(opt);
        opt.dataset.azaleaGlow = code;
        logger.log('Matched option:', text.replace(/\s+/g, ' ').slice(0, 80), 'via', via, 'score', best);
    });

    return true;
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
