
import { NotationError } from './core/notation.error.js';

const objProto = Object.prototype;
const symValueOf = typeof Symbol === 'function'
    ? Symbol.prototype.valueOf
    /* istanbul ignore next */
    : null;

// never use 'g' (global) flag in regexps below
const VAR = /^[a-z$_][a-z$_\d]*$/i;
const ARRAY_NOTE = /^\[(\d+)\]$/;
const ARRAY_GLOB_NOTE = /^\[(\d+|\*)\]$/;
const OBJECT_BRACKETS = /^\[(?:'(.*)'|"(.*)"|`(.*)`)\]$/;
const WILDCARD = /^(\[\*\]|\*)$/;
// matches `*` and `[*]` if outside of quotes.
const WILDCARDS = /(\*|\[\*\])(?=(?:[^"]|"[^"]*")*$)(?=(?:[^']|'[^']*')*$)/;
// matches trailing wildcards at the end of a non-negated glob.
// e.g. `x.y.*[*].*` » $1 = `x.y`, $2 = `.*[*].*`
const NON_NEG_WILDCARD_TRAIL = /^(?!!)(.+?)(\.\*|\[\*\])+$/;
const NEGATE_ALL = /^!(\*|\[\*\])$/;
// ending with '.*' or '[*]'

const utils = {

    re: {
        VAR,
        ARRAY_NOTE,
        ARRAY_GLOB_NOTE,
        OBJECT_BRACKETS,
        WILDCARD,
        WILDCARDS,
        NON_NEG_WILDCARD_TRAIL,
        NEGATE_ALL
    },

    type: (o: unknown): string => {
        const match = objProto.toString.call(o).match(/\s(\w+)/i);
        return match && match[1] ? match[1].toLowerCase() : '';
    },

    isCollection: (o: unknown): boolean => {
        const t = utils.type(o);
        return t === 'object' || t === 'array';
    },

    isset: (o: unknown): boolean => o !== undefined && o !== null,

    ensureArray: (o: unknown): unknown[] => {
        if (utils.type(o) === 'array') return o as unknown[];
        return o === null || o === undefined ? [] : [o];
    },

    // simply returning true will get rid of the "holes" in the array.
    // e.g. [0, , 1, , undefined, , , 2, , , null].filter(() => true);
    // ——» [0, 1, undefined, 2, null]

    // cleanSparseArray(a) {
    //     return a.filter(() => true);
    // },

    // added _collectionType for optimization (in loops)
    hasOwn: (collection: unknown, keyOrIndex: string | number, _collectionType?: string): boolean => {
        if (!collection) return false;
        const isArr = (_collectionType || utils.type(collection)) === 'array';
        if (!isArr && typeof keyOrIndex === 'string') {
            return !!keyOrIndex && objProto.hasOwnProperty.call(collection, keyOrIndex);
        }
        if (typeof keyOrIndex === 'number') {
            return keyOrIndex >= 0 && keyOrIndex < (collection as unknown[]).length;
        }
        return false;
    },

    cloneDeep: (collection: unknown): unknown => {
        const t = utils.type(collection);
        switch (t) {
            case 'date':
                return new Date((collection as Date).valueOf());
            case 'regexp': {
                const regexp = collection as RegExp;
                const flags = regexp.flags;
                const copy = new RegExp(regexp.source, flags);
                copy.lastIndex = regexp.lastIndex;
                return copy;
            }
            case 'symbol':
                return symValueOf
                    ? Object(symValueOf.call(collection as symbol))
                    /* istanbul ignore next */
                    : collection;
            case 'array':
                return (collection as unknown[]).map(utils.cloneDeep);
            case 'object': {
                const copy: Record<string, unknown> = {};
                // only enumerable string keys
                Object.keys(collection as Record<string, unknown>).forEach(k => {
                    copy[k] = utils.cloneDeep((collection as Record<string, unknown>)[k]);
                });
                return copy;
            }
            // primitives copied over by value
            // case 'string':
            // case 'number':
            // case 'boolean':
            // case 'null':
            // case 'undefined':
            default: // others will be referenced
                return collection;
        }
    },

    // iterates over elements of an array, executing the callback for each
    // element.
    each: (
        arr: unknown[],
        callback: (item: unknown, index: number, array: unknown[]) => boolean | void,
        thisArg?: unknown
    ): void => {
        const len = arr.length;
        let index = -1;
        while (++index < len) {
            if (callback.apply(thisArg, [arr[index], index, arr]) === false) return;
        }
    },

    eachRight: (
        arr: unknown[],
        callback: (item: unknown, index: number, array: unknown[]) => boolean | void,
        thisArg?: unknown
    ): void => {
        let index = arr.length;
        while (index--) {
            if (callback.apply(thisArg, [arr[index], index, arr]) === false) return;
        }
    },

    eachProp: (
        obj: Record<string, unknown>,
        callback: (value: unknown, key: string, object: Record<string, unknown>) => boolean | void,
        thisArg?: unknown
    ): void => {
        const keys = Object.keys(obj);
        let index = -1;
        while (++index < keys.length) {
            const key = keys[index];
            if (callback.apply(thisArg, [obj[key], key, obj]) === false) return;
        }
    },

    eachItem: (
        coll: unknown[] | Record<string, unknown>,
        callback: (
            value: unknown,
            keyOrIndex: string | number,
            collection: unknown[] | Record<string, unknown>
        ) => boolean | void,
        thisArg?: unknown,
        reverseIfArray: boolean = false
    ): void => {
        if (utils.type(coll) === 'array') {
            // important! we should iterate with eachRight to prevent shifted
            // indexes when removing items from arrays.
            const arrCallback = callback as (
                item: unknown,
                index: number,
                array: unknown[]
            ) => boolean | void;

            return reverseIfArray
                ? utils.eachRight(coll as unknown[], arrCallback, thisArg)
                : utils.each(coll as unknown[], arrCallback, thisArg);
        }

        const objCallback = callback as (
            value: unknown,
            key: string,
            object: Record<string, unknown>
        ) => boolean | void;

        return utils.eachProp(coll as Record<string, unknown>, objCallback, thisArg);
    },

    pregQuote: (str: string): string => {
        const re = /[.\\+*?[^\]$(){}=!<>|:-]/g;
        return String(str).replace(re, '\\$&');
    },

    stringOrArrayOf: (o: unknown, value: string): boolean => typeof value === 'string'
        && (o === value
            || (utils.type(o) === 'array' && (o as unknown[]).length === 1 && (o as unknown[])[0] === value)
        ),

    // Revert back to regular function since arrow functions don't have their own 'arguments' object
    // eslint-disable-next-line prefer-arrow/prefer-arrow-functions
    hasSingleItemOf(arr: unknown[], itemValue?: unknown): boolean {
        return arr.length === 1
            && (arguments.length === 2 ? arr[0] === itemValue : true);
    },

    // remove trailing/redundant wildcards if not negated
    removeTrailingWildcards: (glob: string): string =>
        // return glob.replace(/(.+?)(\.\*|\[\*\])*$/, '$1');
        glob.replace(NON_NEG_WILDCARD_TRAIL, '$1'),

    normalizeNote: (note: string): string | number => {
        if (VAR.test(note)) return note;
        // check array index notation e.g. `[1]`
        let m = note.match(ARRAY_NOTE);
        if (m) return parseInt(m[1], 10);
        // check object bracket notation e.g. `["a-b"]`
        m = note.match(OBJECT_BRACKETS);
        if (m) return (m[1] || m[2] || m[3]);
        throw new NotationError(`Invalid note: '${note}'`);
    },

    joinNotes: (notes: (string | number)[]): string => {
        const lastIndex = notes.length - 1;
        return notes.map((current: string | number, i: number) => {
            if (!current) return '';
            const next = lastIndex >= i + 1 ? notes[i + 1] : null;
            const dot = next
                ? String(next)[0] === '[' ? '' : '.'
                : '';
            return current + dot;
        }).join('');
    },

    getNewNotation: (newNotation: string | unknown, notation?: string): string => {
        const errMsg = `Invalid new notation: '${newNotation}'`;
        // note validations (for newNotation and notation) are already made by
        // other methods in the flow.
        let newN;
        if (typeof newNotation === 'string') {
            newN = newNotation.trim();
            if (!newN) throw new NotationError(errMsg);
            return newN;
        }
        if (notation && !utils.isset(newNotation)) return notation;
        throw new NotationError(errMsg);
    }

};

export { utils };
