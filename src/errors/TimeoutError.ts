export class TimeoutError extends Error {
  constructor() {
    super('The server is taking too long to respond.');
    this.name = TimeoutError.name;
  }
}
