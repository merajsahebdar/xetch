import fakeTimers, { InstalledClock } from '@sinonjs/fake-timers';
import fetchMock from 'jest-fetch-mock';
import { AbortController } from 'native-abort-controller';
import { HttpError, TimeoutError } from '../errors';
import { ResponseStatus } from '../ResponseStatus';
import { initXetch, xetch } from '../Xetch';

describe('Xetch', () => {
  let c: InstalledClock;

  beforeEach(() => {
    c = fakeTimers.install();
    fetchMock.enableMocks();
  });

  afterEach(() => {
    c.reset();
    c.uninstall();
    fetchMock.disableMocks();
  });

  it('init uri', async () => {
    const xetch = initXetch({
      uri: 'https://xetch.io',
    });

    fetchMock.mockResponseOnce(async ({ url }) => {
      return {
        init: {
          status: ResponseStatus.OK,
        },
        body: JSON.stringify({
          isCorrect: url === 'https://xetch.io/api/v1/users/1',
        }),
      };
    });

    await expect(
      xetch('/api/v1/users/1', {
        method: 'get',
      }).json()
    ).resolves.toEqual({ isCorrect: true });
  });

  it('post json', async () => {
    fetchMock.mockResponseOnce(async (request) => {
      return {
        init: {
          status: ResponseStatus.OK,
        },
        body: await request.text(),
      };
    });

    const user = { name: 'Han Solo' };

    await expect(
      xetch('https://xetch.io/api/v1/users', {
        method: 'post',
        body: {
          user,
        },
      }).json()
    ).resolves.toEqual({ user });
  });

  it('cancel request', async () => {
    fetchMock.mockResponseOnce(async () => {
      c.tick(1000);
      return {
        init: {
          status: ResponseStatus.OK,
        },
      };
    });

    const abortController = new AbortController();
    setTimeout(() => {
      abortController.abort();
    }, 500);

    await expect(
      xetch('https://xetch.io/api/v1/users', {
        method: 'get',
        signal: abortController.signal,
      }).text()
    ).rejects.toThrowError(/the operation was aborted/i);
  });

  it('request non-existing page', async () => {
    fetchMock.mockResponseOnce(async () => {
      return {
        init: {
          status: ResponseStatus.NOT_FOUND,
        },
      };
    });

    await expect(
      xetch('https://xetch.io/api/v1/users/2', {
        method: 'get',
      }).json()
    ).rejects.toThrowError(HttpError);
  });

  it('retry', async () => {
    fetchMock.mockResponseOnce(async () => {
      return {
        init: {
          status: ResponseStatus.REQUEST_TIMEOUT,
        },
      };
    });

    fetchMock.mockResponseOnce(async () => {
      return {
        init: {
          status: ResponseStatus.OK,
        },
      };
    });

    await expect(
      xetch('https://xetch.io/api/v1/users/1', {
        method: 'get',
      }).text()
    ).resolves.toBe('');
  });

  it('get - timeout', async () => {
    fetchMock.mockResponseOnce(async () => {
      c.tick(20 * 1000);
      return {
        init: {
          status: ResponseStatus.OK,
        },
      };
    });

    await expect(
      xetch(
        'https://xetch.io/api/v1/users/1',
        {
          method: 'get',
        },
        {
          timeout: 10 * 1000,
          retry: false,
        }
      ).text()
    ).rejects.toThrowError(TimeoutError);
  });
});
