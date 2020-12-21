'use strict';

jest.mock('koa-passport', () => ({
  use: jest.fn(),
  initialize: jest.fn(),
}));

jest.mock('passport-local', () => {
  return {
    Strategy: class {
      constructor(options, handler) {
        this.options = options;
        this.handler = handler;
      }
    },
  };
});

const passport = require('koa-passport');
const createProviderRegistry = require('../passport/provider-registry');
const createLocalStrategy = require('../passport/local-strategy');
const {
  init,
  syncProviderRegistryWithConfig,
  getProviderCallbackUrl,
  providerRegistry,
} = require('../passport');

const register = jest.spyOn(providerRegistry, 'register');

describe('Passport', () => {
  afterEach(() => {
    providerRegistry.clear();
  });

  describe('Sync Provider Registry with Config', () => {
    test('The provider registry should match the auth config', async () => {
      global.strapi = {
        config: {
          get: () => ({ providers: [{ uid: 'foo' }, { uid: 'bar' }] }),
        },
      };

      syncProviderRegistryWithConfig();

      expect(register).toHaveBeenCalledTimes(2);
      expect(providerRegistry.size).toBe(2);
    });
  });

  describe('Init', () => {
    test('It should register all providers in passport and init it', () => {
      const createStrategy = jest.fn(() => ({ foo: 'bar' }));

      global.strapi = {
        config: {
          get: () => ({
            providers: [
              { uid: 'foo', createStrategy },
              { uid: 'bar', createStrategy },
            ],
          }),
        },
      };

      init();

      expect(providerRegistry.size).toBe(2);
      expect(passport.use).toHaveBeenCalledTimes(3);
      expect(passport.initialize).toHaveBeenCalled();
    });
  });

  describe('Get Provider Callback URL', () => {
    const BASE_URL = '/admin/connect/{{provider}}/callback';

    test.each(['foo', 'bar', 'foobar'])('Get a correct callback url for %s', providerName => {
      expect(getProviderCallbackUrl(providerName)).toBe(
        BASE_URL.replace('{{provider}}', providerName)
      );
    });
  });

  describe('Provider Registry', () => {
    const registry = createProviderRegistry();
    const setSpy = jest.spyOn(registry, 'set');
    const fooProvider = { uid: 'foo', createStrategy: jest.fn() };
    const barProvider = { uid: 'bar', createStrategy: jest.fn() };

    beforeEach(() => {
      global.strapi = { isLoaded: false };
    });

    afterEach(() => {
      registry.clear();
      jest.clearAllMocks();
    });

    test('Cannot register after boostrap', () => {
      global.strapi = { isLoaded: true };

      const fn = () => registry.register(fooProvider);

      expect(fn).toThrowError(`You can't register new provider after the boostrap`);
      expect(registry.size).toBe(0);
    });

    test('Can register a provider', () => {
      registry.register(fooProvider);

      expect(setSpy).toHaveBeenCalledWith(fooProvider.uid, fooProvider);
      expect(registry.size).toBe(1);
    });

    test('Can register several providers at once', () => {
      const providers = [fooProvider, barProvider];

      registry.registerMany(providers);

      expect(setSpy).toHaveBeenCalledTimes(providers.length);
      expect(registry.size).toBe(providers.length);
    });

    test('Do not register twice providers with the same uid', () => {
      const providers = [fooProvider, fooProvider];

      registry.registerMany(providers);

      expect(setSpy).toHaveBeenCalledWith(fooProvider.uid, fooProvider);
      expect(setSpy).toHaveBeenCalledTimes(2);
      expect(registry.size).toBe(1);
    });

    test('Can update the value of a provider', () => {
      const newFooProvider = {
        ...fooProvider,
        newProperty: 'foobar',
      };

      registry.register(fooProvider);
      registry.register(newFooProvider);

      expect(setSpy).toHaveBeenCalledTimes(2);
      expect(registry.size).toBe(1);
      expect(registry.get(fooProvider.uid)).toEqual(newFooProvider);
    });
  });

  describe('Local Strategy', () => {
    test('It should call the callback with the error if the credentials check fails', async () => {
      global.strapi = {
        admin: {
          services: {
            auth: {
              checkCredentials: jest.fn(() => {
                return Promise.reject('Bad credentials');
              }),
            },
          },
        },
      };

      const strategy = createLocalStrategy(strapi);
      const done = jest.fn();

      await strategy.handler('foo', 'bar', done);

      expect(done).toHaveBeenCalledWith('Bad credentials');
    });

    test('It should call the callback with the profile if the credentials check succeed', async () => {
      const args = [null, { id: 'foo' }, 'bar'];
      global.strapi = {
        admin: {
          services: {
            auth: {
              checkCredentials: jest.fn(() => {
                return Promise.resolve(args);
              }),
            },
          },
        },
      };

      const strategy = createLocalStrategy(strapi);
      const done = jest.fn();

      await strategy.handler('foo', 'bar', done);

      expect(done).toHaveBeenCalledWith(...args);
    });
  });
});
