export class CustomerServiceNotFoundError extends Error {
  readonly code = 'CUSTOMER_SERVICE_NOT_FOUND';
  readonly status = 404;

  constructor() {
    super('Customer service not found');
  }
}
