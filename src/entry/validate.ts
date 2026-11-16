import manifest from '@extension/manifest.json';

const ALLOWED_AUTHORS = ['Rosie/mikxxie', 'mikxxie'];

export function validate<T extends Fn>(callback: T) {
    const valid =
        manifest.name === 'Azalea' &&
        ALLOWED_AUTHORS.includes(manifest.author);

    return valid ? callback() : false;
}

export default validate;
