import { AbortController } from 'native-abort-controller';
import { HttpError, TimeoutError } from './errors';
import { ResponseStatus } from './ResponseStatus';

export type XetchRequestInit = Omit<RequestInit, 'body'> & {
  body?: RequestInit['body'] | Record<string | number | symbol, unknown>;
};

export type XetchOption = {
  uri?: string;
  timeout?: number;
  retry?:
    | {
        max: number;
        statusCodes: ResponseStatus[];
      }
    | false;
};

export type XetchInitOption = XetchOption & {
  defaultRequestInit?: XetchRequestInit;
};

export type Xetch = (
  info: RequestInfo,
  init: XetchRequestInit,
  option?: XetchOption
) => XetchReturn;

export type XetchReturn = {
  void: () => Promise<void>;
  json: <T = unknown>() => Promise<T>;
  text: () => Promise<string>;
  formData: () => Promise<FormData>;
  arrayBuffer: () => Promise<ArrayBuffer>;
  blob: () => Promise<ReadableStream>;
};

const DEFAULT_XETCH_OPTION_RETRY = {
  max: 2,
  statusCodes: [
    ResponseStatus.REQUEST_TIMEOUT,
    ResponseStatus.TOO_MANY_REQUESTS,
    ResponseStatus.INTERNAL_SERVER_ERROR,
    ResponseStatus.BAD_GATEWAY,
    ResponseStatus.SERVICE_UNAVAILABLE,
    ResponseStatus.GATEWAY_TIMEOUT,
  ],
};

const DEFAULT_XETCH_OPTION_TIMEOUT = 30 * 1000;

const DEFAULT_REQUEST_INIT: XetchRequestInit = {
  credentials: 'same-origin',
};

const responseTypes = {
  json: 'application/json',
  text: 'text/*',
  formData: 'multipart/form-data',
  arrayBuffer: '*/*',
  blob: '*/*',
};

export function initXetch({
  defaultRequestInit = DEFAULT_REQUEST_INIT,
  ...instanceOption
}: XetchInitOption): Xetch {
  return (info, init, option) => {
    return xetch(
      info,
      { ...defaultRequestInit, ...init },
      { ...instanceOption, ...option }
    );
  };
}

export function xetch(
  info: RequestInfo,
  { body, signal, headers: initHeaders, ...xetchInit }: XetchRequestInit,
  {
    uri,
    retry = DEFAULT_XETCH_OPTION_RETRY,
    timeout = DEFAULT_XETCH_OPTION_TIMEOUT,
  }: XetchOption = {}
) {
  const headers = new Headers(initHeaders);
  const init: RequestInit = { ...xetchInit, headers };

  if (isPlainObject(body)) {
    headers.set('content-type', 'application/json');
    init.body = JSON.stringify(body);
  } else {
    init.body = body as BodyInit;
  }

  const abortController = new AbortController();
  init.signal = abortController.signal;

  signal?.addEventListener('abort', () => {
    abortController.abort();
  });

  const request = new Request(uri ? uri + info : info, init);

  let retriedCount = 0;

  async function doTask(): Promise<Response> {
    try {
      const nextRequest = request.clone();
      const response = await timeoutFetch({
        request: nextRequest,
        timeout,
        abortController,
      });

      if (!response.ok) {
        throw new HttpError(nextRequest, response);
      }

      return response;
    } catch (error) {
      if (doesNeedRetry({ error, retry, retriedCount })) {
        retriedCount++;
        return doTask();
      }

      throw error;
    }
  }

  const ret = {} as XetchReturn;

  for (const [type, mimeType] of Object.entries(responseTypes) as Array<
    [keyof typeof responseTypes, string]
  >) {
    ret[type] = async () => {
      request.headers.set('accept', mimeType);
      return (await doTask())[type]();
    };
  }

  return ret;
}

function doesNeedRetry({
  error,
  retry,
  retriedCount,
}: {
  error: unknown;
  retry: XetchOption['retry'];
  retriedCount: number;
}) {
  const haveToRetry = retry && retriedCount < retry.max;
  if (
    haveToRetry &&
    (error instanceof TimeoutError ||
      (error instanceof HttpError &&
        retry.statusCodes.includes(error.response.status)))
  ) {
    return true;
  }

  return false;
}

function timeoutFetch({
  timeout,
  request,
  abortController,
}: {
  timeout: number;
  request: Request;
  abortController: AbortController;
}) {
  return new Promise<Response>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      abortController.abort();
      reject(new TimeoutError());
    }, timeout);

    fetch(request)
      .then(resolve)
      .catch(reject)
      .then(() => {
        clearTimeout(timeoutId);
      });
  });
}

function isPlainObject(obj: unknown) {
  return (
    !!obj && !!(obj = Object.getPrototypeOf(obj)) && !Object.getPrototypeOf(obj)
  );
}
