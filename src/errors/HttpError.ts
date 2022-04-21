export class HttpError extends Error {
  request: Request;
  response: Response;
  constructor(request: Request, response: Response) {
    super('Server responded an error.');
    this.name = HttpError.name;
    this.request = request;
    this.response = response;
  }
}
