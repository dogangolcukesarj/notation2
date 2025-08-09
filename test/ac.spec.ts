/* eslint camelcase:0, consistent-return:0, max-lines-per-function:0 */

import { Notation } from '../src/core/notation.js';
const notate = Notation.create;
const { union } = Notation.Glob;

// Define type for data or filtered values in the test
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FilteredObject = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FilteredArray = any[];

describe('ac', () => {

    test('#filter()', () => {
        let globs = ['*', '!account.balance.credit', '!account.id', '!secret'];
        const data = {
            name: 'Company, LTD.',
            address: {
                city: 'istanbul',
                country: 'TR'
            },
            account: {
                id: 33,
                taxNo: 12345,
                balance: {
                    credit: 100,
                    deposit: 0
                }
            },
            secret: {
                value: 'hidden'
            }
        };
        let filtered = notate(data).filter(globs).value as FilteredObject;
        expect(filtered.name).toEqual(expect.any(String));
        expect(filtered.address).toEqual(expect.any(Object));
        expect((filtered.address as FilteredObject).city).toEqual('istanbul');
        expect(filtered.account).toBeDefined();
        expect((filtered.account as FilteredObject).id).toBeUndefined();
        expect((filtered.account as FilteredObject).balance).toBeDefined();
        expect((filtered.account as FilteredObject).credit).toBeUndefined();
        expect(filtered.secret).toBeUndefined();

        filtered = notate(data).filter('!*').value as FilteredObject;
        expect(filtered).toEqual({});

        // filtering array of objects
        globs = ['*', '!id'];
        const arrayData = [
            { id: 1, name: 'x', age: 30 },
            { id: 2, name: 'y', age: 31 },
            { id: 3, name: 'z', age: 32 }
        ];
        const arrayFiltered = notate(arrayData).filter(globs).value as FilteredArray;
        expect(arrayFiltered).toEqual(expect.any(Array));
        expect(arrayFiltered.length).toEqual(arrayData.length);
    });

    test('#filter() 2', () => {
        const o = {
            name: 'John',
            age: 30,
            account: {
                id: 1,
                country: 'US'
            }
        };
        const filtered = notate(o).filter(['*', '!account.id', '!age']).value as FilteredObject;
        expect(filtered.name).toEqual('John');
        expect((filtered.account as FilteredObject).id).toBeUndefined();
        expect((filtered.account as FilteredObject).country).toEqual('US');

        expect(o.account.id).toEqual(1);
        expect(o).not.toEqual(filtered);
    });

    test('#union()', () => {
        const globA = ['*', '!id', '!pwd'];
        const globB = ['*', '!pwd', 'title'];
        expect(union(globA, globB)).toEqual(['*', '!pwd']);

        let u = union(['image', 'name'], ['name', '!location']);
        u = union(u, ['*', '!location']);
        expect(u).toEqual(['*', '!location']);
        u = union(['*'], u);
        expect(u).toEqual(['*']);
    });
});
